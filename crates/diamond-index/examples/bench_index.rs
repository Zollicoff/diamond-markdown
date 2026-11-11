//! Times a full index build on a generated vault.
//!
//! ```sh
//! cargo run --release -p diamond-index --example bench_index -- 10000
//! ```
//!
//! The vault is written to a temporary folder and removed afterwards. Notes
//! are generated from a fixed seed, so runs are comparable.

use std::fs;
use std::path::Path;
use std::time::Instant;

use diamond_index::VaultIndex;
use diamond_vault::{Vault, VaultPath};

const WORDS: &[&str] = &[
    "vault", "note", "graph", "link", "index", "editor", "render", "search", "plugin", "canvas",
    "daily", "project", "meeting", "review", "draft", "idea", "source", "summary", "question",
    "answer", "plan", "budget", "quarter", "research", "reading", "writing", "outline", "task",
];
const TAGS: &[&str] = &[
    "project/active",
    "project/done",
    "idea",
    "meeting",
    "reading",
    "todo",
    "area/work",
    "area/home",
    "reference",
    "draft",
];
const FOLDERS: &[&str] = &[
    "Projects",
    "Projects/2026",
    "Areas/Work",
    "Areas/Home",
    "Daily",
    "Reference",
    "Archive",
    "People",
];

/// A small deterministic generator; quality does not matter here.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, bound: usize) -> usize {
        (self.next() % bound as u64) as usize
    }

    fn pick<'a>(&mut self, items: &[&'a str]) -> &'a str {
        items[self.below(items.len())]
    }
}

fn note_name(number: usize) -> String {
    format!("Note {number:05}")
}

fn note_body(rng: &mut Rng, number: usize, total: usize) -> String {
    let mut body = String::with_capacity(2048);
    body.push_str(&format!(
        "---\ntitle: {}\naliases: [N{number}]\ntags: [{}]\ncreated: 2026-11-10\n---\n\n# {}\n\n",
        note_name(number),
        rng.pick(TAGS),
        note_name(number),
    ));
    for section in 0..4 {
        body.push_str(&format!("## Section {section}\n\n"));
        for _ in 0..3 {
            for word in 0..40 {
                if word > 0 {
                    body.push(' ');
                }
                body.push_str(rng.pick(WORDS));
            }
            let target = note_name(rng.below(total));
            body.push_str(&format!(" see [[{target}]] and #{}.\n\n", rng.pick(TAGS)));
        }
        body.push_str(&format!(
            "- [ ] follow up on [[{}|this]]\n",
            note_name(rng.below(total))
        ));
        body.push_str("- [x] done ^done-");
        body.push_str(&section.to_string());
        body.push_str("\n\n");
    }
    body.push_str("```rust\nlet ignored = \"[[Not A Link]] #not-a-tag\";\n```\n");
    body
}

fn generate(root: &Path, total: usize) -> u64 {
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    let mut bytes = 0;
    for number in 0..total {
        let folder = root.join(FOLDERS[number % FOLDERS.len()]);
        fs::create_dir_all(&folder).expect("create folder");
        let body = note_body(&mut rng, number, total);
        bytes += body.len() as u64;
        fs::write(folder.join(format!("{}.md", note_name(number))), body).expect("write note");
    }
    bytes
}

fn main() {
    let total: usize = std::env::args()
        .nth(1)
        .map(|arg| arg.parse().expect("note count must be a number"))
        .unwrap_or(10_000);

    let root = std::env::temp_dir().join(format!("diamond-bench-{}-{total}", std::process::id()));
    fs::create_dir_all(&root).expect("create bench folder");
    let started = Instant::now();
    let bytes = generate(&root, total);
    println!(
        "generated {total} notes, {:.1} MB, in {:.2?}",
        bytes as f64 / 1e6,
        started.elapsed()
    );

    let vault = Vault::open(&root).expect("open vault");
    let mut last = None;
    for run in 1..=5 {
        let (index, report) = VaultIndex::build(&vault).expect("build index");
        println!(
            "build {run}: total {:>9.2?}  walk {:>9.2?}  read+parse {:>9.2?}  resolve {:>9.2?}  ({} notes, {} links, {} skipped)",
            report.total(),
            report.walk,
            report.parse,
            report.graph,
            report.notes,
            report.links,
            report.skipped.len(),
        );
        last = Some(index);
    }

    let mut index = last.expect("at least one build");
    let probe = VaultPath::new(&format!("{}/{}.md", FOLDERS[0], note_name(0))).expect("probe path");
    let started = Instant::now();
    let backlinks = index.backlinks(&probe).len();
    let lookup = started.elapsed();
    let started = Instant::now();
    index.upsert(probe.clone(), "# Edited\n\n[[Note 00001]] #edited\n");
    let upsert = started.elapsed();
    println!(
        "backlinks lookup: {lookup:.2?} ({backlinks} found)   edit one note and re-resolve: {upsert:.2?}"
    );
    println!(
        "tags: {}   unresolved targets: {}",
        index.tags().count(),
        index.unresolved().len()
    );

    fs::remove_dir_all(&root).expect("remove bench folder");
}
