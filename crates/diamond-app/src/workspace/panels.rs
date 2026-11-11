//! How the main window is drawn.

use diamond_vault::VaultPath;
use gpui_kit::component::{
    ActiveTheme as _, Disableable as _, IconName, Sizable as _, StyledExt as _,
    button::{Button, ButtonVariants as _},
    h_flex,
    input::{Editor, Escape, Input},
    label::Label,
    list::ListItem,
    menu::PopupMenuItem,
    resizable::{h_resizable, resizable_panel},
    scroll::ScrollableElement as _,
    status_bar::StatusBar,
    tab::{Tab as TabItem, TabBar},
    text::TextView,
    tree::tree,
    v_flex,
};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

use super::palette::PaletteMode;
use super::{Overlay, RenameBox, SIDE_PANEL_WIDTH, Workspace};
use crate::actions::{
    CloseTab, CommandPalette, DeleteNote, FollowLink, GoBack, GoForward, InsertTemplate, NewNote,
    NewTab, NextPane, NextTab, OpenDailyNote, PreviousPane, PreviousTab, QuickSwitch,
    ReloadSettings, RenameNote, SaveNote, SearchVault, SplitRight, ToggleReading, ToggleTheme,
    UseSystemTheme, WORKSPACE,
};
use crate::plugin::{RowAction, RunCommand};

/// "1 word", "2 words".
fn counted(count: usize, noun: &str) -> String {
    match count {
        1 => format!("1 {noun}"),
        count => format!("{count} {noun}s"),
    }
}

/// What a sidebar menu item does to the entry it was opened on.
type EntryAction = fn(&mut Workspace, &VaultPath, &mut Window, &mut Context<Workspace>);

impl Workspace {
    fn render_sidebar(&self, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let view = cx.entity();
        let menu_view = view.clone();
        let current = self.current().map(ToString::to_string);
        v_flex()
            .size_full()
            .bg(cx.theme().sidebar)
            .child(
                h_flex()
                    .h_9()
                    .pl_3()
                    .pr_1()
                    .justify_between()
                    .border_b_1()
                    .border_color(cx.theme().border)
                    .child(Label::new(self.session.vault_name().to_owned()).font_semibold())
                    .child(
                        Button::new("new-note")
                            .ghost()
                            .xsmall()
                            .icon(IconName::Plus)
                            .tooltip("New note")
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.new_note(None, window, cx);
                            })),
                    ),
            )
            .child(
                tree(&self.tree, move |ix, entry, _selected, _window, cx| {
                    let item = entry.item();
                    let id = item.id.clone();
                    let is_folder = entry.is_folder();
                    let is_current = current.as_deref() == Some(id.as_ref());
                    let marker = if !is_folder {
                        ""
                    } else if entry.is_expanded() {
                        "▾ "
                    } else {
                        "▸ "
                    };
                    let row = ListItem::new(ix)
                        .w_full()
                        .pl(px(14.) * entry.depth() + px(10.))
                        .pr_2()
                        .selected(is_current)
                        .child(format!("{marker}{}", item.label));
                    if is_folder {
                        return row;
                    }
                    view.update(cx, |_, cx| {
                        row.on_click(cx.listener(move |this, event: &ClickEvent, window, cx| {
                            let new_tab = event.modifiers().secondary(cx);
                            this.open_entry(&id, new_tab, window, cx);
                        }))
                    })
                })
                .context_menu(move |_ix, entry, menu, _window, _cx| {
                    let Ok(path) = VaultPath::new(&entry.item().id) else {
                        return menu;
                    };
                    let is_folder = entry.is_folder();
                    // A new note goes into the folder that was clicked, or
                    // beside the file that was.
                    let folder = if is_folder {
                        Some(path.to_string())
                    } else {
                        path.parent().map(str::to_owned)
                    };
                    let item = |label: &'static str, act: EntryAction| {
                        let view = menu_view.clone();
                        let path = path.clone();
                        PopupMenuItem::new(label).on_click(move |_, window, cx| {
                            view.update(cx, |this, cx| act(this, &path, window, cx));
                        })
                    };
                    let new_note_view = menu_view.clone();
                    let menu = if is_folder {
                        menu
                    } else {
                        menu.item(item("Open in new tab", Workspace::open_in_new_tab))
                    };
                    menu.item(
                        PopupMenuItem::new("New note here").on_click(move |_, window, cx| {
                            new_note_view.update(cx, |this, cx| {
                                this.new_note(folder.as_deref(), window, cx);
                            });
                        }),
                    )
                    .item(item("Rename or move…", Workspace::start_rename))
                    .item(item("Delete", Workspace::delete_entry))
                })
                .flex_1()
                .p_1(),
            )
    }

    /// One pane: its row of tabs, the bar for the note showing, and the
    /// note itself.
    fn render_pane(&self, pane_ix: usize, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let pane = &self.panes[pane_ix];
        let tab = pane.tab();
        let in_front = pane_ix == self.active_pane;
        let theme = cx.theme();
        let muted = theme.muted_foreground;
        let border = theme.border;
        let background = theme.background;

        let tabs: Vec<TabItem> = pane
            .tabs
            .iter()
            .map(|tab| {
                let title = match (tab.path(), &tab.view) {
                    (Some(path), _) => self.session.title(path).to_owned(),
                    (None, Some(view)) => view.title.to_string(),
                    (None, None) => "New tab".to_owned(),
                };
                // A dot marks a tab with changes that are not on disk yet.
                let label = if tab.dirty {
                    format!("• {title}")
                } else {
                    title
                };
                let id = tab.id;
                TabItem::new().label(label).suffix(
                    Button::new(("close-tab", id))
                        .ghost()
                        .xsmall()
                        .icon(IconName::Close)
                        .tooltip("Close tab")
                        .on_click(cx.listener(move |this, _, window, cx| {
                            this.close_tab(id, window, cx);
                        })),
                )
            })
            .collect();
        let tab_bar = TabBar::new(("tabs", pane_ix))
            .selected_index(pane.active)
            .children(tabs)
            .on_click(cx.listener(move |this, tab_ix: &usize, window, cx| {
                this.activate(pane_ix, *tab_ix, window, cx);
            }))
            .suffix(
                Button::new(("new-tab", pane_ix))
                    .ghost()
                    .xsmall()
                    .icon(IconName::Plus)
                    .tooltip("New tab")
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.activate_pane(pane_ix, cx);
                        this.new_tab(window, cx);
                    })),
            );

        let title = match (tab.path(), &tab.view) {
            (Some(path), _) => self.session.title(path).to_owned(),
            (None, Some(view)) => view.title.to_string(),
            (None, None) => "No note open".to_owned(),
        };
        let save_state = match (tab.document.is_some(), tab.dirty) {
            (false, _) => "",
            (true, true) => "Edited",
            (true, false) => "Saved",
        };
        let header = h_flex()
            .h_9()
            .pl_1()
            .pr_4()
            .gap_1()
            .border_b_1()
            .border_color(border)
            .child(
                Button::new(("go-back", pane_ix))
                    .ghost()
                    .xsmall()
                    .icon(IconName::ArrowLeft)
                    .tooltip("Go back")
                    .disabled(!tab.history.can_go_back())
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.activate_pane(pane_ix, cx);
                        this.go_back(window, cx);
                    })),
            )
            .child(
                Button::new(("go-forward", pane_ix))
                    .ghost()
                    .xsmall()
                    .icon(IconName::ArrowRight)
                    .tooltip("Go forward")
                    .disabled(!tab.history.can_go_forward())
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.activate_pane(pane_ix, cx);
                        this.go_forward(window, cx);
                    })),
            )
            .child(
                div()
                    .pl_2()
                    .when(!in_front, |title| title.text_color(muted))
                    .child(Label::new(title).font_semibold()),
            )
            .child(div().flex_1())
            .child(
                div()
                    .id(("save-state", pane_ix))
                    .text_sm()
                    .text_color(muted)
                    .child(save_state),
            );

        let body = div().flex_1().min_h_0().child(match &tab.reading {
            _ if tab.view.is_some() => tab
                .view
                .as_ref()
                .map(|view| view.content.clone().into_any_element())
                .unwrap_or_else(|| div().into_any_element()),
            // An empty tab says how to fill it, rather than offering an
            // editor whose text would have nowhere to go.
            _ if tab.document.is_none() => v_flex()
                .size_full()
                .items_center()
                .justify_center()
                .gap_1()
                .text_sm()
                .text_color(muted)
                .child("No note open")
                .child("Pick one in the sidebar, or run a command from the palette.")
                .into_any_element(),
            None => Editor::new(&tab.editor)
                .appearance(false)
                .bordered(false)
                .h(relative(1.))
                .into_any_element(),
            Some((_, rendered)) => {
                let view = cx.entity();
                // A fresh id per note, so each note starts at its top.
                let id = format!(
                    "reading:{}:{}",
                    tab.id,
                    tab.path().map(VaultPath::as_str).unwrap_or_default()
                );
                panel(
                    "reading-view",
                    div().size_full().px_8().py_4().child(
                        TextView::markdown(SharedString::from(id), rendered.clone())
                            .selectable(true)
                            .scrollable(true)
                            .on_link_click(move |address, _, window, cx| {
                                view.update(cx, |this, cx| {
                                    this.activate_pane(pane_ix, cx);
                                    this.open_link(address, window, cx);
                                });
                            }),
                    ),
                )
                .into_any_element()
            }
        });

        v_flex()
            .size_full()
            .bg(background)
            // A click anywhere in a pane makes it the one in front, before
            // whatever was clicked reacts.
            .capture_any_mouse_down(cx.listener(move |this, _, _, cx| {
                this.activate_pane(pane_ix, cx);
            }))
            .child(tab_bar)
            .child(header)
            .child(body)
    }

    /// The middle of the window: the panes side by side over the status
    /// line.
    fn render_panes(&self, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let count = self.panes.len();
        let panes = if count == 1 {
            panel("pane", self.render_pane(0, cx)).into_any_element()
        } else {
            // The pane count is part of the id, so widths remembered for
            // two panes are not applied to three.
            let mut group = h_resizable(("panes", count));
            for pane_ix in 0..count {
                group = group.child(
                    resizable_panel()
                        .child(panel(("pane", pane_ix), self.render_pane(pane_ix, cx))),
                );
            }
            group.into_any_element()
        };
        v_flex()
            .size_full()
            .bg(cx.theme().background)
            .child(div().flex_1().min_h_0().child(panes))
            .child(panel_row("status-line", self.render_status(cx)))
    }

    /// The line under the notes: what just happened or went wrong on the
    /// left, the size of the note in front and its view on the right.
    fn render_status(&self, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let tab = self.tab();
        let theme = cx.theme();
        let (message, color) = if let Some(error) = &self.error {
            (error.clone(), theme.danger)
        } else if let Some(conflict) = &tab.conflict {
            (conflict.clone(), theme.warning)
        } else if let Some(problem) = self.session.settings_problem() {
            (
                format!("Vault settings are not in use: {problem}").into(),
                theme.warning,
            )
        } else if let Some(notice) = &self.notice {
            (notice.clone(), theme.muted_foreground)
        } else {
            (SharedString::default(), theme.muted_foreground)
        };
        let muted = theme.muted_foreground;
        let dark = theme.is_dark();

        let counts = tab.document.as_ref().map(|_| {
            format!(
                "{}  ·  {}",
                counted(tab.live.words, "word"),
                counted(tab.live.characters, "character")
            )
        });
        let mode = if tab.reading.is_some() {
            "Reading"
        } else {
            "Editing"
        };

        StatusBar::new()
            .left(
                div()
                    .id("status-message")
                    .text_sm()
                    .text_color(color)
                    .child(message),
            )
            .when_some(counts, |bar, counts| {
                bar.right(
                    div()
                        .id("word-count")
                        .text_sm()
                        .text_color(muted)
                        .child(counts),
                )
            })
            // Only a note can be read or edited; a view has no such choice.
            .when(tab.document.is_some(), |bar| {
                bar.right(
                    Button::new("toggle-reading")
                        .ghost()
                        .xsmall()
                        .label(mode)
                        .tooltip("Switch between editing and reading")
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.toggle_reading(window, cx);
                        })),
                )
            })
            .right(
                Button::new("toggle-theme")
                    .ghost()
                    .xsmall()
                    .icon(if dark { IconName::Sun } else { IconName::Moon })
                    .tooltip("Switch between light and dark")
                    .on_click(cx.listener(|this, _, window, cx| {
                        this.toggle_theme(window, cx);
                    })),
            )
    }

    fn render_context(&self, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let muted = cx.theme().muted_foreground;
        let tab = self.tab();
        let backlinks = self.backlinks();
        let unresolved = self
            .current()
            .map_or(0, |path| self.session.unresolved_link_count(path));
        // The outline and tags follow the editor as it is typed in; the
        // backlinks come from the index, which follows saves.
        let outline: Vec<(u8, String, usize)> = tab
            .live
            .meta
            .headings
            .iter()
            .map(|heading| (heading.level, heading.text.clone(), heading.range.start))
            .collect();
        let tags: Vec<String> = tab
            .live
            .meta
            .all_tags()
            .into_iter()
            .map(str::to_owned)
            .collect();

        let plugin_sections: Vec<_> = self
            .plugins
            .iter()
            .flat_map(|plugin| plugin.sections(&self.session, self.current()))
            .collect();

        let section = |title: &str, count: usize| {
            div()
                .pt_3()
                .pb_1()
                .text_xs()
                .text_color(muted)
                .child(format!("{} ({count})", title.to_uppercase()))
        };

        v_flex()
            .id("context-panel")
            .size_full()
            .px_3()
            .bg(cx.theme().sidebar)
            .overflow_y_scrollbar()
            .child(section("Backlinks", backlinks.len()))
            .children(
                backlinks
                    .into_iter()
                    .enumerate()
                    .map(|(ix, (path, title))| {
                        ListItem::new(("backlink", ix))
                            .child(title)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.open_note(&path, window, cx);
                            }))
                    }),
            )
            .child(section("Outline", outline.len()))
            .children(
                outline
                    .into_iter()
                    .enumerate()
                    .map(|(ix, (level, text, offset))| {
                        ListItem::new(("outline", ix))
                            .pl(px(10.) * f32::from(level.saturating_sub(1)) + px(8.))
                            .child(text)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.jump_to(offset, window, cx);
                            }))
                    }),
            )
            .child(section("Tags", tags.len()))
            .children(tags.into_iter().enumerate().map(|(ix, tag)| {
                ListItem::new(("tag", ix))
                    .child(format!("#{tag}"))
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.search_tag(&tag, window, cx);
                    }))
            }))
            .children(plugin_sections.into_iter().enumerate().flat_map(
                |(section_ix, plugin_section)| {
                    let heading =
                        section(plugin_section.title, plugin_section.rows.len()).into_any_element();
                    let rows = plugin_section
                        .rows
                        .into_iter()
                        .enumerate()
                        .map(move |(row_ix, row)| (section_ix * 10_000 + row_ix, row))
                        .map(|(id, row)| {
                            let action = row.action;
                            ListItem::new(("plugin-row", id))
                                .child(row.label)
                                .on_click(cx.listener(move |this, _, window, cx| match &action {
                                    RowAction::None => {}
                                    RowAction::Open(path) => this.open_note(path, window, cx),
                                    RowAction::OpenAt(path, line) => {
                                        this.open_at(path, Some(*line), window, cx);
                                    }
                                    RowAction::Run(run) => run(this, window, cx),
                                }))
                                .into_any_element()
                        })
                        .collect::<Vec<_>>();
                    std::iter::once(heading).chain(rows)
                },
            ))
            .when(unresolved > 0, |panel| {
                panel.child(
                    div()
                        .pt_3()
                        .text_xs()
                        .text_color(muted)
                        .child(match unresolved {
                            1 => "1 link leads nowhere".to_owned(),
                            count => format!("{count} links lead nowhere"),
                        }),
                )
            })
    }

    fn render_rename(
        &self,
        rename: &RenameBox,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let theme = cx.theme();
        v_flex()
            .id("rename-box")
            .gap_2()
            .p_3()
            .rounded(theme.radius)
            .border_1()
            .border_color(theme.border)
            .bg(theme.popover)
            // The field has no use of its own for Escape and passes it on.
            .on_action(cx.listener(|this, _: &Escape, window, cx| {
                this.close_overlay(window, cx);
            }))
            .child(
                div()
                    .text_sm()
                    .text_color(theme.muted_foreground)
                    .child(format!("Rename or move {}", rename.path)),
            )
            .child(Input::new(&rename.input))
            .child(
                div()
                    .text_xs()
                    .text_color(theme.muted_foreground)
                    .child("Enter to rename. A name with a / in it is a path from the vault root."),
            )
    }
}

impl Render for Workspace {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.refresh_reading(cx);
        let overlay = match &self.overlay {
            Some(Overlay::Palette(palette)) => {
                Some(self.render_palette(palette, cx).into_any_element())
            }
            Some(Overlay::Rename(rename)) => {
                Some(self.render_rename(rename, cx).into_any_element())
            }
            None => None,
        };
        div()
            .id("workspace")
            .track_focus(&self.focus)
            .key_context(WORKSPACE)
            .on_action(cx.listener(|this, _: &SaveNote, window, cx| {
                this.save(window, cx);
            }))
            .on_action(cx.listener(|this, _: &NewNote, window, cx| {
                this.new_note(None, window, cx);
            }))
            .on_action(cx.listener(|this, _: &RenameNote, window, cx| {
                if let Some(path) = this.current().cloned() {
                    this.start_rename(&path, window, cx);
                }
            }))
            .on_action(cx.listener(|this, _: &DeleteNote, window, cx| {
                if let Some(path) = this.current().cloned() {
                    this.delete_entry(&path, window, cx);
                }
            }))
            .on_action(cx.listener(|this, _: &QuickSwitch, window, cx| {
                this.open_palette(PaletteMode::Notes, "", window, cx);
            }))
            .on_action(cx.listener(|this, _: &SearchVault, window, cx| {
                this.open_palette(PaletteMode::Search, "", window, cx);
            }))
            .on_action(cx.listener(|this, _: &CommandPalette, window, cx| {
                this.open_palette(PaletteMode::Commands, "", window, cx);
            }))
            .on_action(cx.listener(|this, _: &InsertTemplate, window, cx| {
                this.open_palette(PaletteMode::Templates, "", window, cx);
            }))
            .on_action(cx.listener(|this, _: &GoBack, window, cx| {
                this.go_back(window, cx);
            }))
            .on_action(cx.listener(|this, _: &GoForward, window, cx| {
                this.go_forward(window, cx);
            }))
            .on_action(cx.listener(|this, _: &FollowLink, window, cx| {
                this.follow_link(window, cx);
            }))
            .on_action(cx.listener(|this, _: &ToggleReading, window, cx| {
                this.toggle_reading(window, cx);
            }))
            .on_action(cx.listener(|this, _: &NewTab, window, cx| {
                this.new_tab(window, cx);
            }))
            .on_action(cx.listener(|this, _: &CloseTab, window, cx| {
                this.close_current_tab(window, cx);
            }))
            .on_action(cx.listener(|this, _: &NextTab, window, cx| {
                this.cycle_tab(true, window, cx);
            }))
            .on_action(cx.listener(|this, _: &PreviousTab, window, cx| {
                this.cycle_tab(false, window, cx);
            }))
            .on_action(cx.listener(|this, _: &SplitRight, window, cx| {
                this.split_right(window, cx);
            }))
            .on_action(cx.listener(|this, _: &NextPane, window, cx| {
                this.cycle_pane(true, window, cx);
            }))
            .on_action(cx.listener(|this, _: &PreviousPane, window, cx| {
                this.cycle_pane(false, window, cx);
            }))
            .on_action(cx.listener(|this, _: &OpenDailyNote, window, cx| {
                this.open_daily_note(window, cx);
            }))
            .on_action(cx.listener(|this, _: &ToggleTheme, window, cx| {
                this.toggle_theme(window, cx);
            }))
            .on_action(cx.listener(|this, _: &UseSystemTheme, window, cx| {
                this.use_system_theme(window, cx);
            }))
            .on_action(cx.listener(|this, _: &ReloadSettings, _, cx| {
                this.reload_settings(cx);
            }))
            .on_action(cx.listener(|this, command: &RunCommand, window, cx| {
                this.run_command(command.index, window, cx);
            }))
            .relative()
            .size_full()
            .text_color(cx.theme().foreground)
            .child(
                h_resizable("workspace-panels")
                    .child(
                        resizable_panel()
                            .size(px(SIDE_PANEL_WIDTH))
                            .size_range(px(180.)..px(480.))
                            .child(panel("sidebar", self.render_sidebar(cx))),
                    )
                    .child(resizable_panel().child(panel("editor-pane", self.render_panes(cx))))
                    .child(
                        resizable_panel()
                            .size(px(SIDE_PANEL_WIDTH))
                            .size_range(px(180.)..px(480.))
                            .child(panel("context-pane", self.render_context(cx))),
                    ),
            )
            .children(overlay.map(|content| {
                div()
                    .id("overlay-backdrop")
                    .absolute()
                    .top_0()
                    .left_0()
                    .size_full()
                    .flex()
                    .justify_center()
                    .pt(px(72.))
                    .bg(cx.theme().background.opacity(0.6))
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(|this, _, window, cx| this.close_overlay(window, cx)),
                    )
                    .child(
                        div()
                            .id("overlay")
                            .w(px(560.))
                            // Clicks inside must not reach the backdrop.
                            .occlude()
                            .child(content),
                    )
            }))
    }
}

/// Wraps a full-width strip in a named element, for the same reason as
/// [`panel`].
fn panel_row(id: &'static str, content: impl IntoElement) -> impl IntoElement {
    div().id(id).w_full().child(content).test_support()
}

/// Wraps a panel's content in a named element that fills its slot. The name
/// lets window tests find the panel and check where it was laid out.
fn panel(id: impl Into<ElementId>, content: impl IntoElement) -> impl IntoElement {
    div().id(id).size_full().child(content).test_support()
}
