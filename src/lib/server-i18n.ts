import { Language } from "@/lib/i18n";

type Dict = Record<string, string>;

const dictionaries: Record<Language, Dict> = {
  en: {
    youWin1stPrize: "you win 1st prize",
    youWin2ndPrize: "you win 2nd prize",
    youLoss: "you loss",
    winner: "winner",
    loser: "loser"
  },
  am: {
    youWin1stPrize: "የመጀመሪያ ሽልማት ደረጋግጥ",
    youWin2ndPrize: "የሁለተኛ ሽልማት ደረጋግጥ",
    youLoss: "ተሸንፏል",
    winner: "አሸናፊ",
    loser: "ተሸንፏል"
  },
  om: {
    youWin1stPrize: "badhaasa jalqabaa qunnamii",
    youWin2ndPrize: "badhaasa lammaffaa qunnamii",
    youLoss: "mo'ame",
    winner: "mo'ataa",
    loser: "mo'ame"
  }
};

export function translateResult(language: Language, key: string): string {
  return dictionaries[language]?.[key] ?? dictionaries.en[key] ?? key;
}