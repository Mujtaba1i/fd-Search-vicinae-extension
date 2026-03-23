# FD Search

Fast filesystem search for Vicinae powered by `fd`, with local indexing, fuzzy matching, filters, and a live detail pane.

## Features

- Fast indexed search across your configured paths
- Exact-first ranking with fuzzy fallback for small typos and missing words
- Path-aware search, so full paths and folder names are handled well
- Query filters for file type, size, and modified time
- Configurable indexed paths, exclude patterns, hidden-file indexing, and watcher paths
- Automatic reindex on open when the index is stale
- Watcher-triggered reindex on open when watched files or folders changed
- Right-side preview for images and file details for everything else
- Actions to open files, open parent folders, open a terminal, and copy paths

## Requirements

- Vicinae installed
- `fd` or `fdfind` installed

Install `fd`:

**Arch Linux**

```bash
sudo pacman -S fd
```

**Debian / Ubuntu**

```bash
sudo apt install fd-find
```

Then restart Vicinae.

## How Search Works

- Exact matches rank first
- Similar matches come next
- Small typos are tolerated
- Missing-word style queries are supported
- Typing a path scopes results to that path and its contents

Results appear progressively while searching, so you can start seeing matches before the full ranking pass finishes.


Wildcard search:

```text
*.mp3
*.png
```

Type filter:

```text
type:pdf
type:folder
type:image
```

Time filter:

```text
since:30m
since:12h
since:7d
```

Size filter:

```text
size:10mb
size:>500kb
size:<2gb
```

You can combine filters:



You can also exclude words with `-`:

```text
react -node_modules
```

## Settings

The command settings currently support:

- `Reindex After (Minutes)`
  Rebuilds the index when you open the extension and the current index is older than this value.
  Clamped between `0.5` and `20`.

- `Max Results`
  Maximum number of results shown.
  Clamped between `10` and `100`.

- `Indexed Paths`
  Semicolon-separated paths to index.
  Default: `/home`

- `Exclude Patterns`
  Semicolon-separated `fd` exclude patterns.
  Default:

```text
.git;node_modules;dist;build;.cache;.venv;venv;__pycache__
```

- `Hidden Files`
  Optional checkbox to include hidden files and folders.

- `Watcher Paths`
  Semicolon-separated files or folders that can trigger a reindex when changed.

## Important Notes


- Hidden files are skipped by default
- Entering `/` as an indexed path can make indexing very slow and very large
- Enabling hidden-file indexing can greatly increase index size and may slow down or crash the extension on large systems
- Watcher paths are checked when the command is opened, not as a permanent always-running background watcher

## Indexing Behavior

- If no index exists, the extension builds one on first open
- If an index exists and is still fresh, it is used immediately
- If the index is older than the configured reindex time, a refresh starts when you open the extension
- If watcher paths changed, opening the extension can trigger a refresh even before the normal time threshold
- Rebuilds write to a temporary file first, then replace the active index when complete

## UI

- The left side shows ranked search results
- The right side shows:
  - image preview for supported image files
  - metadata such as type, size, created time, modified time, name, parent, and full path for other items

## Actions

Available actions include:

- Open
- Open Parent Folder
- Open Terminal Here
- Copy Full Path
- Copy Name
- Copy Parent Directory
- Rebuild Index

## License

MIT
