# Packs

A pack is a single JSON file holding sets **and the bytes of every image they
use**, so it can be shared or imported with nothing missing. Import one from the
Packs panel in the host view.

## photo-packs.pack.json

Five photo sets — Best Dog Breed, Best Pasta Shape, Best Musical Instrument,
Best Sea Creature, Best Footwear — with a picture on all 80 entries.

**You don't need to import this one.** Those sets are already in
[../data/sets/](../data/sets/); this pack exists to carry their images, which
are gitignored. The server restores anything missing from here on start, so a
fresh clone just works — `npm start` and the pictures are there. `npm run
restore` does the same by hand.

Every image came from [Wikimedia Commons](https://commons.wikimedia.org) and is
public domain or Creative Commons. Attribution for each is in
[photo-packs.credits.md](photo-packs.credits.md), and the license is stored next
to each image inside the pack too.

## Why images aren't committed directly

`data/images/` is gitignored on purpose: it also holds anything you drop or
paste in yourself, which has unknown provenance and shouldn't be republished
under this project's license. Shipping the curated, freely-licensed ones inside
a pack keeps that line clear — and restore only writes images that a committed
set actually references, so a pack can't drop loose files into your tree.
