// Food library from 02-nutrition.md. Used for plain-code meal notes: when he
// opts in with a line ("paneer bhurji 150 g"), matching foods get their facts.

export interface Food {
  key: string;
  name: string;
  unit: string;
  /** Per unit, from the plan's food library. Null when the plan gives no numbers. */
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  aliases: string[];
  tip?: string;
}

export const FOODS: Food[] = [
  { key: "chicken", name: "Chicken breast", unit: "100 g raw", protein: 23, carbs: 0, fat: 2, aliases: ["chicken"], tip: "A workhorse: high protein, low fat." },
  { key: "egg", name: "Whole egg", unit: "1 egg", protein: 6.3, carbs: 0.4, fat: 5, aliases: ["egg", "eggs", "omelette", "omelet", "bhurji"] },
  { key: "egg_white", name: "Egg white", unit: "1 white", protein: 3.6, carbs: 0, fat: 0, aliases: ["egg white", "egg whites", "whites"] },
  { key: "fish", name: "Fish (rohu/surmai)", unit: "100 g raw", protein: 19, carbs: 0, fat: 3, aliases: ["fish", "rohu", "surmai"] },
  { key: "paneer", name: "Paneer", unit: "100 g", protein: 18, carbs: 3, fat: 20, aliases: ["paneer"], tip: "A fat trap: 100 g is 20 g fat, nearly a third of the day's 70 g." },
  { key: "mutton", name: "Mutton", unit: "portion", protein: null, carbs: null, fat: null, aliases: ["mutton", "lamb", "goat"], tip: "A fat trap like paneer; keep portions weighed." },
  { key: "curd", name: "Curd", unit: "200 g", protein: 7, carbs: 9, fat: 8, aliases: ["curd", "dahi", "yogurt", "yoghurt"] },
  { key: "whey", name: "Whey", unit: "1 scoop (30 g)", protein: 24, carbs: 2, fat: 1.5, aliases: ["whey", "protein shake", "shake"] },
  { key: "milk", name: "Milk, full fat", unit: "250 ml", protein: 8, carbs: 12, fat: 8, aliases: ["milk"] },
  { key: "rice", name: "White rice", unit: "100 g raw", protein: 7, carbs: 80, fat: 0.7, aliases: ["rice"], tip: "Weigh it raw: cooked weight swings 2.5–3× with water." },
  { key: "roti", name: "Roti", unit: "30 g atta", protein: 3.5, carbs: 20, fat: 0.5, aliases: ["roti", "chapati", "chapathi", "phulka", "atta"], tip: "Weigh the atta raw." },
  { key: "dal", name: "Toor dal", unit: "100 g raw", protein: 22, carbs: 63, fat: 1.5, aliases: ["dal", "daal", "toor", "sambar"] },
  { key: "banana", name: "Banana", unit: "1 medium", protein: 1, carbs: 27, fat: 0, aliases: ["banana", "bananas"] },
  { key: "peanut_butter", name: "Peanut butter", unit: "15 g", protein: 4, carbs: 3, fat: 8, aliases: ["peanut butter", "pb"] },
];

export function kcalOf(f: Pick<Food, "protein" | "carbs" | "fat">): number | null {
  if (f.protein === null || f.carbs === null || f.fat === null) return null;
  return Math.round(f.protein * 4 + f.carbs * 4 + f.fat * 9);
}

/**
 * Foods mentioned in a free-text meal line, in the order they appear. Longer
 * aliases claim their words first, so "egg whites" isn't also read as "egg".
 */
export function matchFoods(line: string): Food[] {
  const text = ` ${line.toLowerCase().replace(/[^a-z0-9\s]/g, " ")} `;
  const taken: [number, number][] = [];
  const firstAt = new Map<string, { food: Food; at: number }>();
  const candidates = FOODS.flatMap((food) => food.aliases.map((alias) => ({ food, alias }))).sort(
    (a, b) => b.alias.length - a.alias.length,
  );
  for (const { food, alias } of candidates) {
    const re = new RegExp(String.raw`(?<=\s)` + alias.replace(/\s+/g, String.raw`\s+`) + String.raw`(?=\s)`, "g");
    for (const m of text.matchAll(re)) {
      const span: [number, number] = [m.index, m.index + m[0].length];
      if (taken.some(([a, b]) => span[0] < b && a < span[1])) continue;
      taken.push(span);
      const prev = firstAt.get(food.key);
      if (!prev || span[0] < prev.at) firstAt.set(food.key, { food, at: span[0] });
    }
  }
  return [...firstAt.values()].sort((a, b) => a.at - b.at).map((h) => h.food);
}
