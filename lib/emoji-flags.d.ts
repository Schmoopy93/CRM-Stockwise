declare module "emoji-flags" {
  interface CountryFlag {
    code: string;
    emoji: string;
    name: string;
    title: string;
  }

  interface EmojiFlags {
    countryCode(code: string): CountryFlag | undefined;
  }

  const emojiFlags: EmojiFlags;
  export = emojiFlags;
}
