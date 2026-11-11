use super::*;

fn path(raw: &str) -> VaultPath {
    VaultPath::new(raw).unwrap()
}

fn index(notes: &[(&str, &str)]) -> VaultIndex {
    VaultIndex::from_sources(notes.iter().map(|(p, source)| (path(p), *source)))
}

fn resolved(index: &VaultIndex, from: &str, target: &str) -> String {
    match index.resolve(&path(from), target) {
        LinkTarget::Note(note) => note.to_string(),
        LinkTarget::File(file) => format!("file:{file}"),
        LinkTarget::Unresolved(text) => format!("unresolved:{text}"),
    }
}

fn strings(paths: Vec<&VaultPath>) -> Vec<String> {
    paths.into_iter().map(ToString::to_string).collect()
}

#[test]
fn resolves_by_name_path_suffix_and_case() {
    let index = index(&[
        ("Home.md", ""),
        ("Projects/2026/Plan.md", ""),
        ("Archive/Old Plan.md", ""),
    ]);
    assert_eq!(resolved(&index, "Home.md", "Plan"), "Projects/2026/Plan.md");
    assert_eq!(
        resolved(&index, "Home.md", "plan.MD"),
        "Projects/2026/Plan.md"
    );
    assert_eq!(
        resolved(&index, "Home.md", "2026/Plan"),
        "Projects/2026/Plan.md"
    );
    assert_eq!(
        resolved(&index, "Home.md", "Projects/2026/Plan"),
        "Projects/2026/Plan.md"
    );
    assert_eq!(
        resolved(&index, "Home.md", "/Projects/2026/Plan.md"),
        "Projects/2026/Plan.md"
    );
    assert_eq!(
        resolved(&index, "Home.md", "old plan"),
        "Archive/Old Plan.md"
    );
    assert_eq!(resolved(&index, "Home.md", "Missing"), "unresolved:Missing");
    // A suffix must match whole folder names.
    assert_eq!(
        resolved(&index, "Home.md", "026/Plan"),
        "unresolved:026/Plan"
    );
}

#[test]
fn duplicate_names_prefer_same_folder_then_shortest_path() {
    let index = index(&[
        ("Plan.md", ""),
        ("Work/Plan.md", ""),
        ("Work/Notes.md", ""),
        ("Home/Deep/Plan.md", ""),
        ("Home/Other.md", ""),
    ]);
    assert_eq!(resolved(&index, "Work/Notes.md", "Plan"), "Work/Plan.md");
    assert_eq!(resolved(&index, "Home/Other.md", "Plan"), "Plan.md");
    assert_eq!(
        resolved(&index, "Work/Notes.md", "Deep/Plan"),
        "Home/Deep/Plan.md"
    );
}

#[test]
fn a_full_path_beats_a_nearer_suffix_match() {
    let index = index(&[
        ("a/Plan.md", ""),
        ("x/a/Plan.md", ""),
        ("x/a/Source.md", ""),
    ]);
    assert_eq!(resolved(&index, "x/a/Source.md", "a/Plan"), "a/Plan.md");
    assert_eq!(resolved(&index, "x/a/Source.md", "Plan"), "x/a/Plan.md");
}

#[test]
fn aliases_resolve_after_names() {
    let index = index(&[
        (
            "People/Samantha Carter.md",
            "---\naliases: [Sam, Carter]\n---\n",
        ),
        ("Sam.md", ""),
        ("Home.md", ""),
    ]);
    assert_eq!(
        resolved(&index, "Home.md", "carter"),
        "People/Samantha Carter.md"
    );
    // A real note name wins over an alias.
    assert_eq!(resolved(&index, "Home.md", "Sam"), "Sam.md");
}

#[test]
fn backlinks_are_deduplicated_sorted_and_exclude_self() {
    let index = index(&[
        ("A.md", "[[C]] and again [[C|see]] and ![[C]]"),
        ("B.md", "[[C#Heading]]"),
        ("C.md", "[[C]] [[#Top]] [[A]]"),
    ]);
    assert_eq!(
        strings(index.backlinks(&path("C.md"))),
        vec!["A.md", "B.md"]
    );
    assert_eq!(strings(index.backlinks(&path("A.md"))), vec!["C.md"]);
    assert!(index.backlinks(&path("B.md")).is_empty());
    assert!(index.backlinks(&path("Missing.md")).is_empty());
}

#[test]
fn outgoing_reports_each_link_in_order() {
    let index = index(&[("A.md", "[[B]] [[Nope]] [[#Here]]"), ("B.md", "")]);
    let a = path("A.md");
    let b = path("B.md");
    assert_eq!(
        index.outgoing(&a),
        vec![
            LinkTarget::Note(&b),
            LinkTarget::Unresolved("Nope"),
            LinkTarget::Note(&a),
        ]
    );
}

#[test]
fn unresolved_groups_sources_by_target() {
    let index = index(&[
        ("A.md", "[[Ghost]] [[ghost]] [[Other]]"),
        ("B.md", "[[GHOST]]"),
    ]);
    let unresolved = index.unresolved();
    assert_eq!(strings(unresolved["ghost"].clone()), vec!["A.md", "B.md"]);
    assert_eq!(strings(unresolved["other"].clone()), vec!["A.md"]);
    assert_eq!(unresolved.len(), 2);
}

#[test]
fn tags_group_without_case_and_match_nested() {
    let index = index(&[
        ("A.md", "#Project/Active #misc"),
        ("B.md", "---\ntags: [project]\n---\n#project-x"),
        ("C.md", "#project/done #PROJECT/active"),
    ]);
    let tags: Vec<(&str, usize)> = index.tags().collect();
    assert_eq!(
        tags,
        vec![
            ("misc", 1),
            ("project", 1),
            ("project-x", 1),
            ("Project/Active", 2),
            ("project/done", 1),
        ]
    );
    assert_eq!(
        strings(index.notes_with_tag("#project")),
        vec!["A.md", "B.md", "C.md"]
    );
    assert_eq!(
        strings(index.notes_with_tag("project/active")),
        vec!["A.md", "C.md"]
    );
    assert_eq!(strings(index.notes_with_tag("project-x")), vec!["B.md"]);
    assert!(index.notes_with_tag("proj").is_empty());
}

#[test]
fn upsert_and_remove_update_the_graph() {
    let mut index = index(&[("A.md", "[[B]]")]);
    assert_eq!(resolved(&index, "A.md", "B"), "unresolved:B");
    assert_eq!(index.unresolved().len(), 1);

    index.upsert(path("Sub/B.md"), "back to [[A]]");
    assert_eq!(resolved(&index, "A.md", "B"), "Sub/B.md");
    assert_eq!(strings(index.backlinks(&path("Sub/B.md"))), vec!["A.md"]);
    assert_eq!(strings(index.backlinks(&path("A.md"))), vec!["Sub/B.md"]);
    assert!(index.unresolved().is_empty());

    index.upsert(path("Sub/B.md"), "no links now");
    assert!(index.backlinks(&path("A.md")).is_empty());
    assert_eq!(index.len(), 2);

    assert!(index.remove(&path("Sub/B.md")));
    assert!(!index.remove(&path("Sub/B.md")));
    assert_eq!(resolved(&index, "A.md", "B"), "unresolved:B");
    assert_eq!(index.len(), 1);
}

#[test]
fn title_prefers_the_property() {
    let index = index(&[
        ("a/File Name.md", "---\ntitle: Shown\n---\n"),
        ("Plain.md", ""),
    ]);
    assert_eq!(
        index.note(&path("a/File Name.md")).unwrap().title(),
        "Shown"
    );
    assert_eq!(index.note(&path("Plain.md")).unwrap().title(), "Plain");
}

#[test]
fn build_reads_a_vault_from_disk_and_resolves_attachments() {
    let dir = tempfile::tempdir().unwrap();
    let write = |relative: &str, contents: &[u8]| {
        let absolute = dir.path().join(relative);
        std::fs::create_dir_all(absolute.parent().unwrap()).unwrap();
        std::fs::write(absolute, contents).unwrap();
    };
    write(
        "Home.md",
        b"[[Plan]] ![[diagram.png]] ![[Assets/diagram.png]] [[board.canvas]] #home",
    );
    write("Projects/Plan.md", b"[[Home]]");
    write("Assets/diagram.png", b"\x89PNG");
    write("Projects/board.canvas", b"{}");
    write("Broken.md", &[0xff, 0xfe, 0x00]);
    write(".diamond/settings.toml", b"");

    let vault = Vault::open(dir.path()).unwrap();
    let (index, report) = VaultIndex::build(&vault).unwrap();

    assert_eq!(report.notes, 2);
    assert_eq!(report.files, 2);
    assert_eq!(report.links, 5);
    assert_eq!(report.skipped.len(), 1);
    assert_eq!(report.skipped[0].0.as_str(), "Broken.md");

    let home = path("Home.md");
    let plan = path("Projects/Plan.md");
    let png = path("Assets/diagram.png");
    let canvas = path("Projects/board.canvas");
    assert_eq!(
        index.outgoing(&home),
        vec![
            LinkTarget::Note(&plan),
            LinkTarget::File(&png),
            LinkTarget::File(&png),
            LinkTarget::File(&canvas),
        ]
    );
    assert_eq!(strings(index.backlinks(&home)), vec!["Projects/Plan.md"]);
    assert_eq!(strings(index.notes_with_tag("home")), vec!["Home.md"]);
}

#[test]
fn refresh_follows_changes_on_disk() {
    let dir = tempfile::tempdir().unwrap();
    let write = |relative: &str, contents: &str| {
        let absolute = dir.path().join(relative);
        std::fs::create_dir_all(absolute.parent().unwrap()).unwrap();
        std::fs::write(absolute, contents).unwrap();
    };
    write("Home.md", "[[Plan]] [[Later]]");
    write("Projects/Plan.md", "");
    let vault = Vault::open(dir.path()).unwrap();
    let (mut index, _) = VaultIndex::build(&vault).unwrap();
    assert_eq!(resolved(&index, "Home.md", "Later"), "unresolved:Later");

    // Editing a known note changes links, not the file listing.
    write("Projects/Plan.md", "back to [[Home]] #plan");
    let refresh = index.refresh(&vault, &[path("Projects/Plan.md")]).unwrap();
    assert!(!refresh.structure_changed);
    assert_eq!(
        strings(index.backlinks(&path("Home.md"))),
        vec!["Projects/Plan.md"]
    );
    assert_eq!(
        strings(index.notes_with_tag("plan")),
        vec!["Projects/Plan.md"]
    );

    // New files appear; a batch re-resolves once.
    write("Later.md", "");
    write("pic.png", "png");
    let refresh = index
        .refresh(&vault, &[path("Later.md"), path("pic.png")])
        .unwrap();
    assert!(refresh.structure_changed);
    assert_eq!(resolved(&index, "Home.md", "Later"), "Later.md");
    assert_eq!(resolved(&index, "Home.md", "pic.png"), "file:pic.png");

    // A deleted file goes, and links to it become unresolved again.
    std::fs::remove_file(dir.path().join("Later.md")).unwrap();
    let refresh = index.refresh(&vault, &[path("Later.md")]).unwrap();
    assert!(refresh.structure_changed);
    assert_eq!(resolved(&index, "Home.md", "Later"), "unresolved:Later");

    // A path that never existed and is not indexed changes nothing.
    let refresh = index.refresh(&vault, &[path("Never.md")]).unwrap();
    assert!(!refresh.structure_changed);

    // A folder renamed outside the app is reported as the old path gone and
    // the new path present.
    std::fs::rename(dir.path().join("Projects"), dir.path().join("Work")).unwrap();
    let refresh = index
        .refresh(&vault, &[path("Projects"), path("Work")])
        .unwrap();
    assert!(refresh.structure_changed);
    assert!(index.note(&path("Projects/Plan.md")).is_none());
    assert_eq!(resolved(&index, "Home.md", "Plan"), "Work/Plan.md");
    assert_eq!(index.len(), 2);
}

#[test]
fn quick_switch_ranks_names_aliases_and_paths() {
    let index = index(&[
        ("Projects/Quarterly Plan.md", ""),
        ("Plan.md", ""),
        ("People/Samantha Carter.md", "---\naliases: [Sam]\n---\n"),
        ("Archive/Titled.md", "---\ntitle: Planning Retro\n---\n"),
        ("Planets/Mars.md", ""),
    ]);
    let paths = |query: &str| -> Vec<String> {
        index
            .quick_switch(query, 10)
            .into_iter()
            .map(|suggestion| suggestion.path.to_string())
            .collect()
    };

    // Name matches come first, best first; a match only in the folder
    // name comes last.
    assert_eq!(
        paths("plan"),
        vec![
            "Plan.md",
            "Archive/Titled.md",
            "Projects/Quarterly Plan.md",
            "Planets/Mars.md",
        ]
    );
    // An exact alias beats a name that merely starts with the query, and
    // the suggestion says which alias matched.
    let by_alias = index.quick_switch("sam", 10);
    assert_eq!(by_alias[0].path.as_str(), "People/Samantha Carter.md");
    assert_eq!(by_alias[0].alias, Some("Sam"));
    // Otherwise the name is the better match.
    let by_name = index.quick_switch("sm", 10);
    assert_eq!(by_name[0].title, "Samantha Carter");
    assert_eq!(by_name[0].alias, None);

    assert!(paths("zzz").is_empty());
    assert_eq!(paths("").len(), 5);
    assert_eq!(index.quick_switch("", 2).len(), 2);
    assert_eq!(paths("plan").len(), index.quick_switch("plan", 3).len() + 1);
}

#[test]
fn links_between_notes_are_listed_once_and_the_revision_moves() {
    let mut index = index(&[
        ("A.md", "[[B]] and [[B]] again, [[A]] itself, [[Missing]]"),
        ("B.md", "[[A]] back, [[C]]"),
        ("C.md", "alone"),
    ]);
    // A-B once though it is written three times across both notes; no
    // self-link; nothing for a note that does not exist.
    assert_eq!(index.note_links(), vec![(0, 1), (1, 2)]);

    let before = index.revision();
    index.upsert(path("C.md"), "now [[A]]");
    assert_ne!(index.revision(), before);
    assert_eq!(index.note_links(), vec![(0, 1), (0, 2), (1, 2)]);
}
