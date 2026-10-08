/**
 * Fun facts shown while "Finding events near you" loads.
 *
 * Every line here should be something a reader could check. Prefer well
 * documented history over records and rankings, which go stale or get disputed.
 */
export interface FunFact {
  kind: string;
  text: string;
}

export const FUN_FACTS: FunFact[] = [
  {
    kind: "Dance",
    text: "India's Sangeet Natak Akademi recognises eight classical dance forms, from Bharatanatyam in the south to Sattriya in Assam.",
  },
  {
    kind: "Dance",
    text: "Kathak takes its name from “katha”, the Sanskrit word for story. Its first performers were travelling storytellers.",
  },
  {
    kind: "Theatre",
    text: "Yakshagana, the dance-theatre of coastal Karnataka, mixes music, dance, spoken word and towering headdresses in all-night performances.",
  },
  {
    kind: "Theatre",
    text: "Rangashankara, in Bengaluru, was opened in 2004 by Arundhati Nag in memory of her husband, the actor and director Shankar Nag.",
  },
  {
    kind: "Music",
    text: "A raga in Indian classical music is traditionally tied to a time of day or a season, so the right one is played at the right hour.",
  },
  {
    kind: "Music",
    text: "Purandara Dasa, a 16th-century composer from Karnataka, is often called the father of Carnatic music.",
  },
  {
    kind: "Stand-up",
    text: "Most stand-up comedians spend years on open-mic stages, performing five minutes at a time, before they ever get a full set.",
  },
  {
    kind: "Poetry",
    text: "The Kavirajamarga, written around the 9th century, is the earliest surviving work in Kannada literature.",
  },
  {
    kind: "Karnataka",
    text: "Mysuru's Dasara festival has been celebrated for over 400 years, since the Wodeyar kings first held it in 1610.",
  },
  {
    kind: "Theatre",
    text: "The Natya Shastra, an ancient Sanskrit treatise on drama, dance and music, is credited to the sage Bharata and is about 2,000 years old.",
  },
];

/** A fact chosen at random, so a returning visitor does not always see the same one. */
export function randomFact(): FunFact {
  return FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
}
