# malvrz650-jpg

Static file storage based on GitHub Pages

Storage ID: `storage-alpha`

This repository contains generated encrypted storage metadata and objects.

## Public Metadata

The storage host can see public metadata:

- logical filenames and folders;
- MIME types;
- plaintext and encrypted sizes;
- chunk counts;
- public static file contents under `static/`;
- update timing.

The repository is not expected to contain plaintext private file contents or
the master key.

## Layout

```text
index.html
storage-index.css
storage-index.js
README.md
index.json
static-index.json
encrypted/
  images/
  videos/
  other/
static/
  images/
  videos/
  other/
```

`index.html` is a static metadata dashboard. It loads generated metadata from
this repository and displays public storage information.

## Security Notes

- Keep plaintext private content out of this repository.
- Keep the master key and local key copies out of this repository.
- Treat files in `static/` as public.
