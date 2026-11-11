//! Calendar: a month at a time, with the days that have a daily note
//! marked. Clicking a day opens its daily note, creating it if needed.

use chrono::{Datelike as _, NaiveDate};
use gpui_kit::component::{
    ActiveTheme as _, IconName, Sizable as _, StyledExt as _,
    button::{Button, ButtonVariants as _},
    h_flex,
    label::Label,
    v_flex,
};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

use crate::notes::{self, Moment};
use crate::plugin::{Command, Plugin};
use crate::session::Session;
use crate::settings::WeekStart;
use crate::workspace::Workspace;

const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/// Weekday names starting from Monday.
const WEEKDAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/// The month `delta` months away from `month` of `year`.
pub fn shift_month(year: i32, month: u32, delta: i32) -> (i32, u32) {
    let months = year * 12 + month as i32 - 1 + delta;
    (months.div_euclid(12), months.rem_euclid(12) as u32 + 1)
}

/// The days of a month laid out in weeks. Each week has seven slots; slots
/// before the 1st and after the last day are empty.
pub fn month_grid(year: i32, month: u32, starts: WeekStart) -> Vec<[Option<u32>; 7]> {
    let Some(first) = NaiveDate::from_ymd_opt(year, month, 1) else {
        return Vec::new();
    };
    let (next_year, next_month) = shift_month(year, month, 1);
    let days = NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .map_or(31, |next| (next - first).num_days() as u32);
    let lead = match starts {
        WeekStart::Monday => first.weekday().num_days_from_monday(),
        WeekStart::Sunday => first.weekday().num_days_from_sunday(),
    } as usize;

    let mut weeks = Vec::new();
    let mut week = [None; 7];
    for day in 1..=days {
        let slot = (lead + day as usize - 1) % 7;
        week[slot] = Some(day);
        if slot == 6 || day == days {
            weeks.push(week);
            week = [None; 7];
        }
    }
    weeks
}

/// The calendar plugin.
#[derive(Default)]
pub struct Calendar;

impl Plugin for Calendar {
    fn id(&self) -> &'static str {
        "calendar"
    }

    fn commands(&self) -> Vec<Command> {
        vec![Command::new(
            "Show calendar",
            &["month", "dates", "daily notes", "journal"],
            |workspace, window, cx| {
                workspace.open_view("calendar", "Calendar", window, cx, |workspace, cx| {
                    let now = Moment::now();
                    let view = CalendarView {
                        workspace: cx.entity().downgrade(),
                        year: now.year,
                        month: now.month,
                        starts: WeekStart::default(),
                        with_notes: Vec::new(),
                        _watch: None,
                    };
                    let handle = cx.entity();
                    let session = workspace.session();
                    cx.new(|cx| view.watching(session, &handle, cx))
                });
            },
        )]
    }
}

/// The month shown in a tab.
pub struct CalendarView {
    workspace: WeakEntity<Workspace>,
    year: i32,
    month: u32,
    starts: WeekStart,
    /// The days of the month shown that have a daily note.
    with_notes: Vec<u32>,
    _watch: Option<Subscription>,
}

impl CalendarView {
    fn watching(
        mut self,
        session: &Session,
        workspace: &Entity<Workspace>,
        cx: &mut Context<Self>,
    ) -> Self {
        self.read(session);
        // Whenever the window changes anything, look for daily notes again.
        self._watch = Some(cx.observe(workspace, |this, workspace, cx| {
            this.read(workspace.read(cx).session());
            cx.notify();
        }));
        self
    }

    /// Finds which days of the month shown have a daily note.
    fn read(&mut self, session: &Session) {
        self.starts = session.settings().calendar.week_starts;
        self.with_notes = (1..=31)
            .filter(|&day| {
                let moment = Moment {
                    year: self.year,
                    month: self.month,
                    day,
                    hour: 0,
                    minute: 0,
                };
                notes::daily_note_path(session.settings(), moment)
                    .is_ok_and(|path| session.is_note(&path))
            })
            .collect();
    }

    fn show(&mut self, year: i32, month: u32, cx: &mut Context<Self>) {
        (self.year, self.month) = (year, month);
        if let Some(workspace) = self.workspace.upgrade() {
            self.read(workspace.read(cx).session());
        }
        cx.notify();
    }
}

impl Render for CalendarView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let now = Moment::now();
        let (year, month) = (self.year, self.month);
        let theme = cx.theme();
        let (muted, primary, border) = (theme.muted_foreground, theme.primary, theme.border);

        let weekdays = (0..7).map(|slot| {
            let name = match self.starts {
                WeekStart::Monday => WEEKDAYS[slot],
                WeekStart::Sunday => WEEKDAYS[(slot + 6) % 7],
            };
            div()
                .w(px(44.))
                .text_xs()
                .text_color(muted)
                .text_center()
                .child(name)
        });
        let weeks = month_grid(year, month, self.starts)
            .into_iter()
            .map(|week| {
                h_flex()
                    .gap_1()
                    .children(week.into_iter().enumerate().map(|(slot, day)| {
                        let Some(day) = day else {
                            return div().w(px(44.)).h(px(36.)).into_any_element();
                        };
                        let has_note = self.with_notes.contains(&day);
                        let is_today = (now.year, now.month, now.day) == (year, month, day);
                        div()
                            .id(("calendar-day", day as usize * 10 + slot))
                            .w(px(44.))
                            .h(px(36.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded(px(6.))
                            .cursor_pointer()
                            .border_1()
                            .border_color(if is_today { primary } else { border })
                            .when(has_note, |cell| cell.font_semibold().text_color(primary))
                            .when(!has_note, |cell| cell.text_color(muted))
                            .child(day.to_string())
                            .on_click(cx.listener(move |this, _, window, cx| {
                                let Some(workspace) = this.workspace.upgrade() else {
                                    return;
                                };
                                let moment = Moment {
                                    year,
                                    month,
                                    day,
                                    ..Moment::now()
                                };
                                workspace.update(cx, |workspace, cx| {
                                    workspace.open_daily_note_for(moment, window, cx);
                                });
                            }))
                            .into_any_element()
                    }))
            })
            .collect::<Vec<_>>();

        let step = |id: &'static str, icon: IconName, delta: i32, cx: &mut Context<Self>| {
            Button::new(id)
                .ghost()
                .xsmall()
                .icon(icon)
                .on_click(cx.listener(move |this, _, _, cx| {
                    let (year, month) = shift_month(this.year, this.month, delta);
                    this.show(year, month, cx);
                }))
        };
        let previous = step("calendar-previous", IconName::ChevronLeft, -1, cx);
        let next = step("calendar-next", IconName::ChevronRight, 1, cx);

        v_flex()
            .id("calendar-view")
            .size_full()
            .p_4()
            .gap_2()
            .child(
                h_flex()
                    .gap_2()
                    .child(previous)
                    .child(
                        div().w(px(160.)).text_center().child(
                            Label::new(format!("{} {year}", MONTHS[month as usize - 1]))
                                .font_semibold(),
                        ),
                    )
                    .child(next)
                    .child(
                        Button::new("calendar-today")
                            .ghost()
                            .xsmall()
                            .label("Today")
                            .on_click(cx.listener(|this, _, _, cx| {
                                let now = Moment::now();
                                this.show(now.year, now.month, cx);
                            })),
                    ),
            )
            .child(h_flex().gap_1().children(weekdays))
            .children(weeks)
            .child(
                div()
                    .pt_2()
                    .text_xs()
                    .text_color(muted)
                    .child("Days in colour have a daily note. Click a day to open its note."),
            )
    }
}

#[cfg(test)]
mod tests {
    // Named imports only: a glob would bring in the UI library's `test`
    // attribute, which then shadows the standard one it expands to.
    use super::{month_grid, shift_month};
    use crate::settings::WeekStart;

    #[test]
    fn months_shift_across_years() {
        assert_eq!(shift_month(2026, 11, 1), (2026, 12));
        assert_eq!(shift_month(2026, 12, 1), (2027, 1));
        assert_eq!(shift_month(2026, 1, -1), (2025, 12));
        assert_eq!(shift_month(2026, 3, -15), (2024, 12));
        assert_eq!(shift_month(2026, 3, 0), (2026, 3));
    }

    #[test]
    fn a_month_is_laid_out_in_weeks_from_the_chosen_first_day() {
        // November 2026 starts on a Sunday and has 30 days.
        let monday = month_grid(2026, 11, WeekStart::Monday);
        assert_eq!(monday.len(), 6);
        assert_eq!(monday[0], [None, None, None, None, None, None, Some(1)]);
        assert_eq!(monday[1][0], Some(2));
        assert_eq!(monday[5], [Some(30), None, None, None, None, None, None]);

        let sunday = month_grid(2026, 11, WeekStart::Sunday);
        assert_eq!(sunday.len(), 5);
        assert_eq!(sunday[0][0], Some(1));
        assert_eq!(sunday[4][..2], [Some(29), Some(30)]);

        // Every day appears once, in order, whatever the month.
        for (year, month, days) in [(2024, 2, 29), (2026, 2, 28), (2026, 12, 31), (2026, 4, 30)] {
            let listed: Vec<u32> = month_grid(year, month, WeekStart::Monday)
                .into_iter()
                .flatten()
                .flatten()
                .collect();
            assert_eq!(listed, (1..=days).collect::<Vec<_>>(), "{year}-{month}");
        }
        assert!(month_grid(2026, 13, WeekStart::Monday).is_empty());
    }
}
