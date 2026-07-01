import languages from "@/lib/languages.json";

export const activeLanguages = languages.filter((language) => language.active);
