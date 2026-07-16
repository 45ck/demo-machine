# Documentation

Use this page as the map for the repo docs. Start with the workflow that matches what you are trying to do, then drop into the reference docs when you need exact fields or commands.

## Start Here

- [Getting Started](../GETTING-STARTED.md): first local run, install requirements, and the starter workflow.
- [CLI Reference](cli-reference.md): every command, common option, and output rule.
- [Spec Reference](spec-reference.md): supported fields, actions, targets, narration, and redaction.
- [Share Viewer](share-viewer.md): generate a private-by-default chaptered viewing page with safe calls to action.
- [Glossary](glossary.md): names for artifacts, manifests, quality files, and pipeline stages.

## Create Better Demos

- [Demo Anything](demo-anything.md): authoring principles, target selection, example matrix, and the new-app playbook.
- [Demo Gallery](demo-gallery.md): curated visual examples with GIF previews and frame captures.
- [Share Viewer](share-viewer.md): package a completed video for accessible, tracking-free review or publication.
- [Examples Assurance](examples-assurance-plan.md): how examples are organized, validated, rendered, and reviewed.

## Agent Workflows

- [MCP Integration](mcp.md): connect demo-machine to Claude Desktop, Codex, or any MCP-capable coding agent.
- [Demo Anything: Meta Prompt QA](demo-anything.md#meta-prompt-qa): create a fresh fixture app, local Codex skill, prompt, narrated demos, and review handoff.
- [.claude skills](../.claude/skills/demo-machine/SKILL.md): Claude Code-style local skill instructions for generating and reviewing demos.
- [Analyzer review flow](mcp.md#prompts): generate `review-prompt.md` with `demo-machine analyze`, then use MCP `review-demo` for evidence-backed agent review.

## Quality And Release

- [Verification Matrix](verification-matrix.md): what each validation layer proves today.
- [Verification Roadmap](verification-roadmap.md): planned expansion for rendered-video assurance, visual polish, redaction, flake, and parity checks.
- [Examples Assurance: Video Assurance](examples-assurance-plan.md#video-assurance): MP4 sampling checks for blank frames, frozen spans, and visual jumps.
- [CLI Analyze](cli-reference.md#analyze-options): analyzer artifacts and how they feed the optional analyzer checks in `quality.json`.
- [Golden Frames And Visual Diff](verification-matrix.md#current-enforcement): current frame-baseline and visual-regression command contracts.

## Project Operations

- [Contributing](../CONTRIBUTING.md): development workflow and quality expectations.
- [Releasing](../RELEASING.md): local release process.
- [Changelog](../CHANGELOG.md): user-visible changes by version.
- [Security](../SECURITY.md): supported versions and vulnerability reporting.

## Historical Notes

- [Fagan Review: Demo Anything Hardening](fagan-review-2026-02-18.md): inspection notes from the examples and verification hardening pass.
