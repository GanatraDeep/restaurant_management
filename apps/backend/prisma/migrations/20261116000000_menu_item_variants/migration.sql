-- Rates for kinds of the same dish (Dosa: Plain / Butter / Oil).
ALTER TABLE "menu_items" ADD COLUMN     "variants" JSONB NOT NULL DEFAULT '[]';
