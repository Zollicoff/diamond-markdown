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
    text::TextView,
    tree::tree,
    v_flex,
};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

use super::palette::PaletteMode;
use super::{Overlay, RenameBox, SIDE_PANEL_WIDTH, Workspace};
use crate::actions::{
    CommandPalette, DeleteNote, FollowLink, GoBack, GoForward, InsertTemplate, NewNote,
    OpenDailyNote, QuickSwitch, ReloadSettings, RenameNote, SaveNote, SearchVault, ToggleReading,
    ToggleTheme, UseSystemTheme, WORKSPACE,
};

/// "1 word", "2 words".
fn counted(count: usize, noun: &str) -> String {
    match count {
        1 => format!("1 {noun}"),
        count => format!("{count} {noun}s"),
    }
}

impl Workspace {
    fn render_sidebar(&self, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let view = cx.entity();
        let menu_view = view.clone();
        let current = self.session.current().map(|path| path.to_string());
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
                        row.on_click(cx.listener(move |this, _, window, cx| {
                            this.open_entry(&id, window, cx);
                        }))
                    })
                })
                .context_menu(move |_ix, entry, menu, _window, _cx| {
                    let Ok(path) = VaultPath::new(&entry.item().id) else {
                        return menu;
                    };
                    // A new note goes into the folder that was clicked, or
                    // beside the file that was.
                    let folder = if entry.is_folder() {
                        Some(path.to_string())
                    } else {
                        path.parent().map(str::to_owned)
                    };
                    let item = |label: &'static str,
                                act: fn(
                        &mut Workspace,
                        &VaultPath,
                        &mut Window,
                        &mut Context<Workspace>,
                    )| {
                        let view = menu_view.clone();
                        let path = path.clone();
                        PopupMenuItem::new(label).on_click(move |_, window, cx| {
                            view.update(cx, |this, cx| act(this, &path, window, cx));
                        })
                    };
                    let new_note_view = menu_view.clone();
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

    fn render_editor(&self, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let title = self
            .session
            .current_title()
            .unwrap_or("No note open")
            .to_owned();
        let open = self.session.current().is_some();
        let save_state = if !open {
            ""
        } else if self.session.is_dirty(&self.editor.read(cx).value()) {
            "Edited"
        } else {
            "Saved"
        };
        let theme = cx.theme();
        let muted = theme.muted_foreground;

        let header = h_flex()
            .h_9()
            .pl_1()
            .pr_4()
            .gap_1()
            .border_b_1()
            .border_color(theme.border)
            .child(
                Button::new("go-back")
                    .ghost()
                    .xsmall()
                    .icon(IconName::ArrowLeft)
                    .tooltip("Go back")
                    .disabled(!self.history.can_go_back())
                    .on_click(cx.listener(|this, _, window, cx| this.go_back(window, cx))),
            )
            .child(
                Button::new("go-forward")
                    .ghost()
                    .xsmall()
                    .icon(IconName::ArrowRight)
                    .tooltip("Go forward")
                    .disabled(!self.history.can_go_forward())
                    .on_click(cx.listener(|this, _, window, cx| this.go_forward(window, cx))),
            )
            .child(div().pl_2().child(Label::new(title).font_semibold()))
            .child(div().flex_1())
            .child(
                div()
                    .id("save-state")
                    .text_sm()
                    .text_color(muted)
                    .child(save_state),
            );

        let body = div().flex_1().min_h_0().child(match &self.reading {
            None => Editor::new(&self.editor)
                .appearance(false)
                .bordered(false)
                .h(relative(1.))
                .into_any_element(),
            Some((_, rendered)) => {
                let view = cx.entity();
                // A fresh id per note, so each note starts at its top.
                let id = self
                    .session
                    .current()
                    .map(|path| format!("reading:{path}"))
                    .unwrap_or_default();
                panel(
                    "reading-view",
                    div().size_full().px_8().py_4().child(
                        TextView::markdown(SharedString::from(id), rendered.clone())
                            .selectable(true)
                            .scrollable(true)
                            .on_link_click(move |address, _, window, cx| {
                                view.update(cx, |this, cx| {
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
            .bg(cx.theme().background)
            .child(header)
            .child(body)
            .child(panel_row("status-line", self.render_status(cx)))
    }

    /// The line under the note: what just happened or went wrong on the
    /// left, the note's size and the view on the right.
    fn render_status(&self, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let theme = cx.theme();
        let (message, color) = if let Some(error) = &self.error {
            (error.clone(), theme.danger)
        } else if let Some(conflict) = &self.conflict {
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

        let counts = self.session.current().map(|_| {
            format!(
                "{}  ·  {}",
                counted(self.live.words, "word"),
                counted(self.live.characters, "character")
            )
        });
        let mode = if self.reading.is_some() {
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
            .right(
                Button::new("toggle-reading")
                    .ghost()
                    .xsmall()
                    .label(mode)
                    .tooltip("Switch between editing and reading")
                    .on_click(cx.listener(|this, _, window, cx| {
                        this.toggle_reading(window, cx);
                    })),
            )
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
        let backlinks = self.session.backlinks();
        let unresolved = self.session.unresolved_link_count();
        // The outline and tags follow the editor as it is typed in; the
        // backlinks come from the index, which follows saves.
        let outline: Vec<(u8, String, usize)> = self
            .live
            .meta
            .headings
            .iter()
            .map(|heading| (heading.level, heading.text.clone(), heading.range.start))
            .collect();
        let tags: Vec<String> = self
            .live
            .meta
            .all_tags()
            .into_iter()
            .map(str::to_owned)
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
            .on_action(cx.listener(|this, _: &SaveNote, _, cx| {
                this.save(cx);
            }))
            .on_action(cx.listener(|this, _: &NewNote, window, cx| {
                this.new_note(None, window, cx);
            }))
            .on_action(cx.listener(|this, _: &RenameNote, window, cx| {
                if let Some(path) = this.session.current().cloned() {
                    this.start_rename(&path, window, cx);
                }
            }))
            .on_action(cx.listener(|this, _: &DeleteNote, window, cx| {
                if let Some(path) = this.session.current().cloned() {
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
                    .child(resizable_panel().child(panel("editor-pane", self.render_editor(cx))))
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
fn panel(id: &'static str, content: impl IntoElement) -> impl IntoElement {
    div().id(id).size_full().child(content).test_support()
}
