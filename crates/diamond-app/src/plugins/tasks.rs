//! Tasks: every task in the vault in one list.
//!
//! A task is an ordinary Markdown task item, `- [ ] Call Sam`. Writing
//! `due:2026-11-20` anywhere in it gives it a due date. Tasks with a date
//! are listed first, soonest first; ticking a task in the list ticks it in
//! its note.

use chrono::NaiveDate;
use diamond_vault::VaultPath;
use gpui_kit::component::{
    ActiveTheme as _, Sizable as _, StyledExt as _,
    button::{Button, ButtonVariants as _},
    h_flex,
    label::Label,
    list::ListItem,
    scroll::ScrollableElement as _,
    v_flex,
};
use gpui_kit::*;

use crate::plugin::{Command, Plugin};
use crate::session::TaskItem;
use crate::workspace::Workspace;

/// The due date written in a task, if it has a valid one.
pub fn due_date(text: &str) -> Option<NaiveDate> {
    text.split_whitespace()
        .filter_map(|word| word.strip_prefix("due:"))
        .find_map(|date| {
            let date = date.trim_end_matches(|c: char| !c.is_ascii_digit());
            NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()
        })
}

/// A task as the list shows it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Listed {
    pub task: TaskItem,
    pub due: Option<NaiveDate>,
}

/// Puts tasks in the order they are listed: those with a due date first,
/// soonest first, then the rest by note and line. Finished tasks are left
/// out unless `with_done`.
pub fn arrange(tasks: Vec<TaskItem>, with_done: bool) -> Vec<Listed> {
    let mut listed: Vec<Listed> = tasks
        .into_iter()
        .filter(|task| with_done || !task.done)
        .map(|task| Listed {
            due: due_date(&task.text),
            task,
        })
        .collect();
    // The sort is stable, so tasks without a date keep their note order.
    listed.sort_by_key(|listed| (listed.due.is_none(), listed.due));
    listed
}

/// The tasks plugin.
#[derive(Default)]
pub struct Tasks;

impl Plugin for Tasks {
    fn id(&self) -> &'static str {
        "tasks"
    }

    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "Show tasks",
            &["todo", "to-do", "checklist", "due"],
            |workspace, window, cx| {
                workspace.open_view("tasks", "Tasks", window, cx, |workspace, cx| {
                    let tasks = workspace.session().tasks();
                    let handle = cx.entity();
                    cx.new(|cx| TasksView::new(tasks, &handle, cx))
                });
            },
        )]
    }
}

/// The list of tasks, shown in a tab.
pub struct TasksView {
    workspace: WeakEntity<Workspace>,
    tasks: Vec<TaskItem>,
    with_done: bool,
    _watch: Subscription,
}

impl TasksView {
    fn new(tasks: Vec<TaskItem>, workspace: &Entity<Workspace>, cx: &mut Context<Self>) -> Self {
        Self {
            workspace: workspace.downgrade(),
            tasks,
            with_done: false,
            // Whenever the window changes anything, read the tasks again.
            _watch: cx.observe(workspace, |this, workspace, cx| {
                this.tasks = workspace.read(cx).session().tasks();
                cx.notify();
            }),
        }
    }

    fn with_workspace(
        &self,
        window: &mut Window,
        cx: &mut Context<Self>,
        act: impl FnOnce(&mut Workspace, &mut Window, &mut Context<Workspace>),
    ) {
        if let Some(workspace) = self.workspace.upgrade() {
            workspace.update(cx, |workspace, cx| act(workspace, window, cx));
        }
    }
}

impl Render for TasksView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let today = chrono::Local::now().date_naive();
        let listed = arrange(self.tasks.clone(), self.with_done);
        let open = self.tasks.iter().filter(|task| !task.done).count();
        let muted = cx.theme().muted_foreground;
        let danger = cx.theme().danger;

        let rows = listed.into_iter().enumerate().map(|(ix, listed)| {
            let Listed { task, due } = listed;
            let path: VaultPath = task.path.clone();
            let open_path = task.path.clone();
            let line = task.line;
            let overdue = !task.done && due.is_some_and(|due| due < today);
            h_flex()
                .gap_2()
                .child(
                    Button::new(("task-box", ix))
                        .ghost()
                        .xsmall()
                        .label(if task.done { "☑" } else { "☐" })
                        .tooltip(if task.done {
                            "Not done after all"
                        } else {
                            "Done"
                        })
                        .on_click(cx.listener(move |this, _, window, cx| {
                            this.with_workspace(window, cx, |workspace, window, cx| {
                                workspace.toggle_task(&path, line, window, cx);
                            });
                        })),
                )
                .child(
                    ListItem::new(("task", ix))
                        .flex_1()
                        .child(
                            h_flex()
                                .gap_2()
                                .child(div().flex_1().child(task.text))
                                .children(due.map(|due| {
                                    div()
                                        .text_sm()
                                        .text_color(if overdue { danger } else { muted })
                                        .child(due.format("%Y-%m-%d").to_string())
                                }))
                                .child(div().text_sm().text_color(muted).child(task.note)),
                        )
                        .on_click(cx.listener(move |this, _, window, cx| {
                            this.with_workspace(window, cx, |workspace, window, cx| {
                                workspace.open_at(&open_path, Some(line), window, cx);
                            });
                        })),
                )
        });

        v_flex()
            .id("tasks-view")
            .size_full()
            .p_4()
            .gap_1()
            .overflow_y_scrollbar()
            .child(
                h_flex()
                    .justify_between()
                    .pb_2()
                    .child(
                        Label::new(match open {
                            1 => "1 task to do".to_owned(),
                            open => format!("{open} tasks to do"),
                        })
                        .font_semibold(),
                    )
                    .child(
                        Button::new("tasks-with-done")
                            .ghost()
                            .xsmall()
                            .label(if self.with_done {
                                "Hide finished"
                            } else {
                                "Show finished"
                            })
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.with_done = !this.with_done;
                                cx.notify();
                            })),
                    ),
            )
            .children(rows)
    }
}

#[cfg(test)]
mod tests {
    // Named imports only: a glob would bring in the UI library's `test`
    // attribute, which then shadows the standard one it expands to.
    use chrono::NaiveDate;
    use diamond_vault::VaultPath;

    use super::{arrange, due_date};
    use crate::session::TaskItem;

    fn task(note: &str, line: usize, done: bool, text: &str) -> TaskItem {
        TaskItem {
            path: VaultPath::new(&format!("{note}.md")).unwrap(),
            note: note.to_owned(),
            line,
            done,
            text: text.to_owned(),
        }
    }

    #[test]
    fn a_due_date_is_read_from_anywhere_in_the_task() {
        let date = |y, m, d| NaiveDate::from_ymd_opt(y, m, d);
        assert_eq!(due_date("Call Sam due:2026-11-20"), date(2026, 11, 20));
        assert_eq!(due_date("due:2026-01-02, then relax"), date(2026, 1, 2));
        assert_eq!(due_date("no date here"), None);
        assert_eq!(due_date("due:soon"), None);
        assert_eq!(due_date("due:2026-13-40"), None);
        assert_eq!(due_date("overdue:2026-11-20"), None);
        // The first valid date wins.
        assert_eq!(due_date("due:never due:2026-03-04"), date(2026, 3, 4));
    }

    #[test]
    fn dated_tasks_come_first_and_finished_ones_are_optional() {
        let tasks = vec![
            task("A", 0, false, "no date"),
            task("A", 1, false, "later due:2026-12-01"),
            task("B", 0, true, "finished due:2026-01-01"),
            task("B", 3, false, "sooner due:2026-11-15"),
            task("C", 0, false, "also no date"),
        ];
        let texts = |with_done| {
            arrange(tasks.clone(), with_done)
                .into_iter()
                .map(|listed| listed.task.text)
                .collect::<Vec<_>>()
        };
        assert_eq!(
            texts(false),
            vec![
                "sooner due:2026-11-15",
                "later due:2026-12-01",
                "no date",
                "also no date"
            ]
        );
        assert_eq!(texts(true)[0], "finished due:2026-01-01");
        assert_eq!(texts(true).len(), 5);
    }
}
