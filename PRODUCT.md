# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Node.js local server with a dependency-free HTML/CSS/JS editor surface; the MCP adapter uses the official TypeScript SDK.

## Users

The primary users are the people maintaining static HTML projects on the local D drive. They need to adjust a page visually without repeatedly hunting through CSS and JavaScript files.

## Product Purpose

The editor opens an existing static project, previews its real page, lets a user select visible elements, adjust geometry and presentation, replace images, configure interaction triggers, and save the result back into the project.

## Positioning

The editor is source-aware and local-first: it works against the existing HTML/CSS/JS folders and exposes the same operations to an AI through MCP instead of moving the project into a proprietary hosted format.

## Operating Context

It runs on a local machine beside the static projects. A user starts one local server, browses folders on D drive, picks a project, edits the live iframe, saves, and can optionally connect an AI client through the provided stdio MCP server.

## Capabilities and Constraints

- Existing projects use static HTML, CSS, JavaScript, and assets folders.
- Projects may contain multiple HTML pages; the editor must expose a page selector and keep page edits isolated.
- The first delivery must support project discovery, live preview, element selection, layer navigation, position and size editing, image replacement, trigger metadata, undo/redo in the editor session, HTML/config save, and MCP tools for the same operations.
- Element selection needs a confirm step and a session-only lock so an upper layer can be skipped while editing deeper elements.
- Scripts in the preview are trusted workspace code and may run in the iframe.
- Trigger metadata is stored as `data-vse-trigger` on the selected element and is designed to be consumed by a later runtime adapter.
- The first version is local-only; it does not upload project files to a hosted service.

## Evidence on Hand

The workspace contains static project directories such as `妈妈`, `时间`, `手指`, `望远镜`, and `显微镜`, each with an `index.html`, `css/`, `js/`, and `assets/` structure.

## Product Principles

- Keep the existing source structure understandable.
- Make every change visible before it is saved.
- Use plain language in the editor controls.
- Keep AI actions reversible and explicit.
- Keep the local project as the source of truth.

## Accessibility & Inclusion

Keyboard focus, visible selection states, clear labels, and a reduced-motion preference are required for the editor chrome.
