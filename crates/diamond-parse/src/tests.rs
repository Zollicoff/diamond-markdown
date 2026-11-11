use super::*;

fn link_targets(meta: &NoteMeta) -> Vec<&str> {
    meta.links.iter().map(|link| link.target.as_str()).collect()
}

fn tag_names(meta: &NoteMeta) -> Vec<&str> {
    meta.tags.iter().map(|tag| tag.name.as_str()).collect()
}

#[test]
fn wikilinks_with_display_heading_and_block() {
    let source = "See [[Plan]], [[Projects/Plan|the plan]], [[Plan#Budget]] and [[Plan#^q3]].";
    let meta = parse(source);
    assert_eq!(meta.links.len(), 4);

    let plain = &meta.links[0];
    assert_eq!(plain.target, "Plan");
    assert_eq!(plain.display, None);
    assert_eq!(plain.subpath, None);
    assert!(!plain.embed);
    assert_eq!(plain.syntax, LinkSyntax::Wiki);
    assert_eq!(&source[plain.range.clone()], "[[Plan]]");

    assert_eq!(meta.links[1].target, "Projects/Plan");
    assert_eq!(meta.links[1].display.as_deref(), Some("the plan"));
    assert_eq!(meta.links[2].target, "Plan");
    assert_eq!(
        meta.links[2].subpath,
        Some(Subpath::Heading("Budget".into()))
    );
    assert_eq!(meta.links[3].subpath, Some(Subpath::Block("q3".into())));
}

#[test]
fn embeds_are_links_marked_embed() {
    let source = "![[diagram.png]]\n\n![[Plan#Budget]]\n";
    let meta = parse(source);
    assert_eq!(link_targets(&meta), vec!["diagram.png", "Plan"]);
    assert!(meta.links.iter().all(|link| link.embed));
    assert_eq!(&source[meta.links[0].range.clone()], "![[diagram.png]]");
}

#[test]
fn same_note_links_have_an_empty_target() {
    let meta = parse("Jump to [[#Summary]].");
    assert_eq!(meta.links[0].target, "");
    assert_eq!(
        meta.links[0].subpath,
        Some(Subpath::Heading("Summary".into()))
    );
}

#[test]
fn markdown_links_keep_internal_targets_and_drop_urls() {
    let meta = parse(
        "[plan](Projects/My%20Plan.md#Budget) [site](https://example.com) \
         [mail](mailto:a@b.co) <https://auto.link> ![pic](assets/pic.png)",
    );
    assert_eq!(
        link_targets(&meta),
        vec!["Projects/My Plan.md", "assets/pic.png"]
    );
    assert_eq!(meta.links[0].syntax, LinkSyntax::Markdown);
    assert_eq!(meta.links[0].display.as_deref(), Some("plan"));
    assert_eq!(
        meta.links[0].subpath,
        Some(Subpath::Heading("Budget".into()))
    );
    assert!(meta.links[1].embed);
}

#[test]
fn links_and_tags_inside_code_are_ignored() {
    let meta = parse(
        "Real [[One]] #real\n\n`[[Inline]] #inline`\n\n```\n[[Fenced]] #fenced\n```\n\n    [[Indented]] #indented\n",
    );
    assert_eq!(link_targets(&meta), vec!["One"]);
    assert_eq!(tag_names(&meta), vec!["real"]);
}

#[test]
fn tags_follow_the_tag_rules() {
    let source = "#start mid #project/active, #snake_case #kebab-case #café #2026 #1a \
                  word#notatag #trailing/ and a lone # mark";
    let meta = parse(source);
    assert_eq!(
        tag_names(&meta),
        vec![
            "start",
            "project/active",
            "snake_case",
            "kebab-case",
            "café",
            "1a",
            "trailing"
        ]
    );
    let nested = &meta.tags[1];
    assert_eq!(&source[nested.range.clone()], "#project/active");
}

#[test]
fn tags_in_headings_count_and_heading_markers_do_not() {
    let meta = parse("# Title #topic\n\n## Second\n");
    assert_eq!(tag_names(&meta), vec!["topic"]);
    assert_eq!(meta.headings.len(), 2);
}

#[test]
fn escaped_hash_is_not_a_tag() {
    assert!(parse("Price is \\#1 and \\#cheap").tags.is_empty());
}

#[test]
fn headings_report_level_text_and_line() {
    let meta = parse("# One\n\ntext\n\n## Two with `code` and *emphasis*\n\nSetext\n======\n");
    let summary: Vec<(u8, &str, usize)> = meta
        .headings
        .iter()
        .map(|heading| (heading.level, heading.text.as_str(), heading.line))
        .collect();
    assert_eq!(
        summary,
        vec![
            (1, "One", 0),
            (2, "Two with code and emphasis", 4),
            (1, "Setext", 6)
        ]
    );
}

#[test]
fn frontmatter_properties_title_aliases_and_tags() {
    let source = "---\ntitle: Quarterly Plan\naliases: [QP, Plan 2026]\ntags:\n  - work\n  - \"#planning\"\nrating: 4.5\ndone: false\ncount: 3\nempty:\n---\n\n# Body #inline\n";
    let meta = parse(source);
    let frontmatter = meta.frontmatter.as_ref().expect("frontmatter");
    assert_eq!(frontmatter.error, None);
    assert_eq!(frontmatter.title.as_deref(), Some("Quarterly Plan"));
    assert_eq!(frontmatter.aliases, vec!["QP", "Plan 2026"]);
    assert_eq!(frontmatter.tags, vec!["work", "planning"]);
    assert_eq!(frontmatter.get("rating"), Some(&PropertyValue::Number(4.5)));
    assert_eq!(frontmatter.get("done"), Some(&PropertyValue::Bool(false)));
    assert_eq!(frontmatter.get("count"), Some(&PropertyValue::Number(3.0)));
    assert_eq!(frontmatter.get("empty"), Some(&PropertyValue::Null));
    assert!(source[frontmatter.range.clone()].starts_with("---\ntitle"));
    assert_eq!(meta.all_tags(), vec!["work", "planning", "inline"]);
    assert_eq!(meta.headings.len(), 1);
}

#[test]
fn frontmatter_accepts_single_values_and_separated_tag_strings() {
    let meta = parse("---\nalias: Solo\ntags: one, two three\n---\n");
    let frontmatter = meta.frontmatter.unwrap();
    assert_eq!(frontmatter.aliases, vec!["Solo"]);
    assert_eq!(frontmatter.tags, vec!["one", "two", "three"]);
}

#[test]
fn invalid_frontmatter_reports_an_error_and_does_not_panic() {
    let meta = parse("---\ntitle: [unclosed\n---\n\nBody [[Link]]\n");
    let frontmatter = meta.frontmatter.expect("frontmatter");
    assert!(frontmatter.error.is_some());
    assert!(frontmatter.properties.is_empty());
    assert_eq!(meta.links.len(), 1);
}

#[test]
fn a_rule_later_in_the_note_is_not_frontmatter() {
    let meta = parse("Intro\n\n---\n\nnot: yaml\n\n---\n");
    assert!(meta.frontmatter.is_none());
}

#[test]
fn all_tags_deduplicates_case_insensitively() {
    let meta = parse("---\ntags: [Work]\n---\n#work #Other #other\n");
    assert_eq!(meta.all_tags(), vec!["Work", "Other"]);
}

#[test]
fn block_ids_at_the_end_of_blocks() {
    let source =
        "A paragraph. ^para-1\n\n- item one ^item1\n- item two\n\nNot ^mid sentence.\n\nx^glued\n";
    let meta = parse(source);
    let ids: Vec<(&str, usize)> = meta
        .blocks
        .iter()
        .map(|block| (block.id.as_str(), block.line))
        .collect();
    assert_eq!(ids, vec![("para-1", 0), ("item1", 2)]);
    assert_eq!(&source[meta.blocks[0].range.clone()], "^para-1");
}

#[test]
fn tasks_report_state_and_line() {
    let meta = parse("- [ ] open\n- [x] done\n- plain\n  - [X] nested\n");
    let tasks: Vec<(bool, usize)> = meta
        .tasks
        .iter()
        .map(|task| (task.checked, task.line))
        .collect();
    assert_eq!(tasks, vec![(false, 0), (true, 1), (true, 3)]);
}

#[test]
fn links_in_tables_and_lists() {
    // A bare `|` ends a table cell, so inside a table a link's `|` is
    // written `\|`.
    let meta = parse("| a | b |\n|---|---|\n| [[One]] | [[Two\\|2]] |\n\n- [[Three]]\n");
    assert_eq!(link_targets(&meta), vec!["One", "Two", "Three"]);
    assert_eq!(meta.links[1].display.as_deref(), Some("2"));
}

#[test]
fn empty_and_whitespace_notes() {
    assert_eq!(parse(""), NoteMeta::default());
    assert_eq!(parse("\n\n  \n"), NoteMeta::default());
}

#[test]
fn multibyte_text_keeps_ranges_on_character_boundaries() {
    let source = "Zürich 東京 [[Café Notes]] #日本語 ^blk\n";
    let meta = parse(source);
    assert_eq!(&source[meta.links[0].range.clone()], "[[Café Notes]]");
    assert_eq!(&source[meta.tags[0].range.clone()], "#日本語");
    assert_eq!(meta.blocks[0].id, "blk");
}

#[test]
fn percent_encoding_round_trips() {
    for text in [
        "Plain",
        "My Note (v2)#Heading",
        "Zürich/東京 notes",
        "100% & [brackets]",
    ] {
        let encoded = percent_encode(text);
        assert!(
            encoded
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-._~/%".contains(&b))
        );
        assert_eq!(percent_decode(&encoded), text);
    }
    assert_eq!(percent_encode("a b/c.md"), "a%20b/c.md");
    assert_eq!(percent_decode("bad%zzescape%2"), "bad%zzescape%2");
}

#[test]
fn property_values_are_written_on_one_line() {
    use PropertyValue::{Bool, List, Map, Null, Number, Text};
    assert_eq!(Text("open".into()).to_string(), "open");
    assert_eq!(Number(3.0).to_string(), "3");
    assert_eq!(Number(2.5).to_string(), "2.5");
    assert_eq!(Bool(true).to_string(), "true");
    assert_eq!(Null.to_string(), "");
    assert_eq!(
        List(vec![Text("a".into()), Number(1.0), List(vec![Bool(false)])]).to_string(),
        "[a, 1, [false]]"
    );
    assert_eq!(
        Map(vec![("k".into(), Text("v".into())), ("n".into(), Null)]).to_string(),
        "{k: v, n: }"
    );
}
