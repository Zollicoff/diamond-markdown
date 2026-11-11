//! The core plugins: features compiled into the app, each in its own module
//! and each using only the plugin interface.

pub mod bookmarks;

use crate::plugin::Plugin;

/// Every core plugin, in the order their commands and panel sections appear.
pub fn core() -> Vec<Box<dyn Plugin>> {
    vec![Box::new(bookmarks::Bookmarks::default())]
}
