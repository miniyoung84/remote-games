# Packs

A pack is a single JSON file holding sets **and the bytes of every image they
use**, so it can be shared or imported with nothing missing. Import one from the
Packs panel in the host view.

## photo-packs.pack.json

Five photo sets — Best Dog Breed, Best Pasta Shape, Best Musical Instrument,
Best Sea Creature, Best Footwear — with a picture on all 80 entries.

Every image came from [Wikimedia Commons](https://commons.wikimedia.org) and is
public domain or Creative Commons. Attribution for each is in
[photo-packs.credits.md](photo-packs.credits.md), and the license is also stored
next to each image inside the pack.

The sets themselves also live in [../data/sets/](../data/sets/). The images do
not — `data/images/` is gitignored — so **import this pack to get the pictures**.
Importing renames rather than overwrites, so if you already have those sets,
delete them first or you'll end up with two copies.
