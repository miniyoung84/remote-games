# Generating bracket sets with another AI

Copy everything in the block below into any AI chat. It's self-contained — the
model doesn't need to know anything about this project. Paste the JSON it gives
you into `data/sets/<id>.json`, or into the host view's set editor.

---

````text
I run a bracket game during my team's daily standup at work. I need you to
invent bracket sets for it. Here's exactly how the game works, so you can judge
what will and won't land:

HOW IT'S PLAYED
- 16 things go into a single-elimination bracket, shown on a screen I share in
  a Teams call.
- Each person, when their turn in standup comes around, decides ONE matchup
  single-handedly — they just say which of the two things wins. Then they give
  their normal work update.
- There is no group discussion, no voting, and no debate. A turn takes about
  five seconds.
- Turn order is whoever raises their hand next, and who shows up varies day to
  day. A bracket often spans several days.

WHAT MAKES A GOOD SET
- Every matchup should be instantly decidable by anyone, with zero preparation,
  while they're half-thinking about their work update.
- The fun comes from other people reacting to a bold call, not from the picker
  having to justify it.
- Nobody should feel stupid for not knowing what an entry is. Assume a mixed
  international team with different ages, backgrounds and interests.
- Ideally slightly absurd, so a "wrong" answer is funny rather than incorrect.

HARD RULES
- Nothing contentious in a workplace: no politics, religion, nationality,
  sports rivalries, health or body topics, money or salary, or anything that
  ranks people, teams, tools we use, or anyone's work.
- Nothing that requires specific cultural knowledge to participate — no
  entries that only land if you grew up in one country or watched one show.
- No inside jokes about real colleagues, and nothing that could read as a dig
  at a real person or department.
- Entries must be things, not people.
- Avoid anything where one answer is objectively correct — it should be
  a matter of taste.

FORMAT RULES
- Exactly 16 entries, all distinct.
- Keep each entry SHORT: aim for 18 characters or fewer, never more than 30.
  Long entries get truncated on the display.
- The title is a superlative question, e.g. "Best Office Snack".
- The subtitle is a short, light one-liner, or an empty string.

OUTPUT
Give me 5 different bracket set ideas. For each, first give one sentence on why
it will work for this group, then the set as a JSON code block in exactly this
shape:

{
  "id": "kebab-case-id",
  "title": "Best Office Snack",
  "subtitle": "Settle it once and for all",
  "items": ["Pretzels", "Cheez-Its", "..."],
  "updatedAt": 0
}

Aim for range across the five — some everyday and concrete, some whimsical or
hypothetical. Avoid anything close to the examples I gave you.
````

---

## Round two: asking the same AI for more

Paste this into the **same thread**, after it has given you its first batch. It
carries the exclusion list so you don't get the same ideas back — regenerate the
list below if your library has changed.

---

````text
Same game, same rules as before. I now have 20 sets, and I need ones that open
up genuinely new territory. Here is everything I already have. Do not propose
anything that overlaps with any of these:

- Best Animal Sidekick — Dog, Cat, Duck, Rabbit…
- Best Color — Red, Blue, Green, Yellow…
- Best Everyday Object — Scissors, Sticky notes, Duct tape, Pen…
- Best Fruit — Mango, Strawberry, Watermelon, Pineapple…
- Best Household Smell — Fresh bread, Coffee, Clean laundry, Cut grass…
- Best Impossible Ride — Flying carpet, Rocket sofa, Bubble submarine, Cloud with handles…
- Best Kind of Joke — Bad pun, Straight face, Unexpected twist, Running joke…
- Best Mundane Superpower — Never lose keys, Perfect parking, All green lights, Unlimited hot water…
- Best Office Snack — Pretzels, Cheez-Its, Trail mix, Clementines…
- Best Place to Take a Nap — Couch, Hammock, Window seat, Under a tree…
- Best Playground Classic — Swing, Slide, Seesaw, Monkey bars…
- Best Room Upgrade — Secret door, Indoor slide, Ceiling stars, Giant beanbag…
- Best Sandwich — Grilled cheese, BLT, Reuben, Banh mi…
- Best Story Ending — Happy ending, Bittersweet ending, Big surprise, Full circle…
- Best Superpower — Flight, Invisibility, Time travel, Teleportation…
- Best Thing to Wear — T-shirt, Hoodie, Jeans, Sweater…
- Best Tiny Triumph — Clean sticker peel, Beating the alarm, Perfect high five, Catching mid-air…
- Best Useless Talent — Juggling, Pen spinning, Origami folding, Moonwalking…
- Best Way to Spend a Free Hour — Nap, Walk outside, Read a book, Cook something…
- Best Way to Travel — Train, Airplane, Bicycle, Walking…
- Best Weather — Clear blue sky, Light rain, Thunderstorm, Fresh snowfall…
- Greatest Fictional Workplace — Dunder Mifflin, Wonka's Chocolate Factory, Jurassic Park, The Krusty Krab…
- Most Satisfying Sound — Bubble wrap, Rain on a roof, Fire crackling, Ocean waves…
- Superior Shape — Hexagon, Triangle, Circle, Square…
- Top Punctuation — Comma, Semicolon, Period, Exclamation mark…
- Ultimate Condiment — Ketchup, Mustard, Mayonnaise, Hot sauce…
- Ultimate Container — Cardboard box, Glass jar, Tin can, Plastic tub…
- Worst Minor Inconvenience — Wet socks, Stubbed toe, Paper cut, Slow Wi-Fi…

These categories are FULL. Don't send me any more of them:
- Food and drink
- Superpowers, magic powers, or wishes of any kind
- Sensory sets about sounds or smells
- Travel, vehicles and ways of getting around
- Home and room comforts

What I want this round is sets with more conversational payoff. The best ones so
far are where a bold pick makes the room react — either because the choice
reveals something about the person, or because both options are genuinely
appealing and the matchup is a real dilemma. A set where most matchups have an
obvious winner is a bad set.

Directions worth exploring, but don't feel limited to them:
- Trade-offs where you'd honestly struggle to choose
- Concrete hypotheticals nobody has to ask the meaning of
- Everyday things everyone has an opinion about but has never had to rank
- Universal human experiences that land the same in any country or age group

Everything from before still applies. To restate the important parts: nothing
political, religious, national, health-related, money-related, or connected to
work in any way. Nothing requiring specific cultural knowledge — no films, TV,
music, books, brands, or public figures, because someone in the room won't know
them. Entries are things, not people. Exactly 16 entries, 18 characters or
fewer each, all distinct. It must be a matter of taste, never correctness.

Give me 5, each with one sentence on why it will play well with this group,
then the JSON in the same shape as before.
````

## What actually plays well

Best Fruit was the runaway success, and the reason is worth copying. Everyone
has first-hand experience of all sixteen entries, so there is no knowledge
floor at all; the entries are directly comparable on one axis; and a few are
famously divisive, which is where the argument lives. Consensus at the top,
war in the middle.

Sets built on abstract categories are noticeably flatter, even when the entries
are good — people have no stored opinion to defend. That recipe lives
overwhelmingly in food and other everyday sensory things, which is why the
library leans that way.

## Checking what you get back

Before dropping a set in, skim it for the two failure modes an AI will still
hit sometimes:

- **A knowledge floor.** If someone would have to ask "what is that?", cut it.
  Every entry must be recognisable to everyone in the room.
- **Entries that are secretly about work.** Anything referencing meetings,
  processes, tools or roles can turn into a complaint session. Keep it away
  from the day job.

Sets don't have to be 16 — any count from 2 up works, and non-powers-of-two get
byes automatically. 8 is a good size if you want a bracket that finishes in one
standup.
