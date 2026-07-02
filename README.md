# NOAA POES / ESSA Image Archive

A small static front end for browsing [NOAA NCEI's public POES/ESSA satellite image archive](https://www.ncei.noaa.gov/data/poes-essa-noaa-image-files/access/) (1966–1978).

There's no backend and no copy of the data anywhere. NOAA's directory is served with `Access-Control-Allow-Origin: *`, so the page fetches NOAA's own Apache directory listings client-side, parses them for satellite/channel/date metadata baked into the filenames, and renders a grid. Thumbnails are generated on the fly by the [wsrv.nl](https://wsrv.nl) image proxy (so the grid isn't pulling multi-megabyte originals per tile) and cached at their edge — nothing is downloaded or re-hosted by this project. Clicking an image opens the real, full-resolution file straight from NOAA.

## Running locally

```
python3 -m http.server 8080
```

Then open `http://localhost:8080`. (Opening `index.html` directly via `file://` can break the directory-listing `fetch()` calls in some browsers — serve it instead.)

## How it works

- `app.js` fetches NOAA's year → month directory listings directly and parses the HTML `<a>` tags.
- Filenames like `E3.VIS.1966.12.11.1.png` and `NOAA5.IRday.north.1978.01.01.1.best.xc.1233.yc.1233.rad.930.png` are parsed for satellite, channel, hemisphere, date, and frame number.
- Thumbnails route through `https://wsrv.nl/?url=<noaa-file>&w=480&output=webp` for fast loading; each `<img>` falls back to the raw NOAA file if the proxy ever fails.
- The grid renders in batches of 48, revealed via `IntersectionObserver` as you scroll, with native `loading="lazy"` on every image.

## Notes / caveats

- Thumbnailing depends on the free `wsrv.nl` proxy, which has no uptime guarantee. Under heavy traffic it may throttle, in which case thumbnails fall back to loading full-resolution NOAA originals directly.
- This only covers the years NOAA has published in this particular archive (1966–1978).

## Credits

Imagery: [NOAA National Centers for Environmental Information](https://www.ncei.noaa.gov/). Thumbnail proxy: [wsrv.nl](https://wsrv.nl).
