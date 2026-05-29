export const CAST_PROMPT_VERSION = 1;

export function buildCastPrompt(manualHouseguests = ""): string {
  return `Generate a brand-new fictional Big Brother US-style cast for Big Botter.

Return only valid JSON. No markdown, no prose outside JSON.

JSON shape:
{
  "houseguests": [
    {
      "name": "string",
      "age": number,
      "occupation": "string",
      "hometown": "City, ST",
      "bio": "string",
      "personality": "string",
      "talkingStyle": "string",
      "archetype": "string",
      "stats": {
        "strength": number,
        "endurance": number,
        "agility": number,
        "speed": number,
        "iq": number,
        "memory": number,
        "charisma": number,
        "luck": number
      },
      "morale": number,
      "portraitUrl": ""
    }
  ]
}

Requirements:
- Exactly 16 original adult fictional people.
- No real people, celebrities, public figures, or copyrighted characters.
- Make them feel like a varied Big Brother US cast: messy, strategic, funny, flawed, and rated R in attitude without explicit sexual content.
- Include a balanced mix of archetypes: villain, floater, loyalist, chaos agent, social butterfly, comp beast, underdog, delusional mastermind, recruit, superfan, showmance bait, mediator.
- Stats are 1-100 and must match the profile. Athletes should skew physical; scientists/analysts should skew IQ/memory; salespeople/performers should skew charisma.
- Keep stats varied. Do not make everyone well-rounded.
- Morale starts between 60 and 80.
- Bio should be 2-4 sentences with playable hooks, flaws, and strategic liabilities.
- Talking style should be specific enough for future dialogue generation.

Manual houseguest inputs to preserve if provided:
${manualHouseguests || "(none)"}`;
}

