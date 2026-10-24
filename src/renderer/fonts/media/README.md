# Media home fonts

Unmodified Latin / Latin Extended WOFF2 subsets from the locally installed official Fontsource packages:

- `@fontsource/ibm-plex-sans` 5.3.0: IBM Plex Sans regular (400), medium (500), semibold (600).
- `@fontsource/sora` 5.3.0: Sora semibold (600).

These are the families used by the reviewed Luna beta source. They are loaded locally for the new media surfaces only; existing browser/studio font styling is retained. No npm dependency version was changed. Both families are separately licensed under SIL OFL 1.1, not under Luna's GPL source license. The complete copyright and license notices accompany them in `ibm-plex-sans-OFL.txt` and `sora-OFL.txt`.

Font binaries were not modified. CSS keeps their original family names. Turkish characters are provided through the Latin Extended subset; loading does not require a CDN.
