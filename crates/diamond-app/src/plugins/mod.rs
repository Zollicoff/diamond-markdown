//! The core plugins: features compiled into the app, each in its own module
//! and each using only the plugin interface.

pub mod bookmarks;
pub mod calendar;
pub mod tasks;

use crate::plugin::Plugin;

/// Every core plugin, in the order their commands and panel sections appear.
pub fn core() -> Vec<Box<dyn Plugin>> {
    vec![
        Box::new(bookmarks::Bookmarks::default()),
        Box::new(tasks::Tasks),
        Box::new(calendar::Calendar),
    ]
}
