export type Lang = "en" | "ar";

// Shape of the Google Translate v2 success response.
export interface TranslateResponse {
  data: {
    translations: Array<{
      translatedText: string;
      detectedSourceLanguage?: string;
    }>;
  };
}
