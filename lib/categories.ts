import type { category } from "@/db/schema";

export type Category = (typeof category.enumValues)[number];

// Every Category by the name travellers see, in the order they are listed.
export const CATEGORY_NAMES: Record<Category, string> = {
  flight: "Flight",
  car_rental: "Car rental",
  accommodation: "Accommodation",
  activity: "Activity",
  food: "Food",
  transport: "Transport",
  other: "Other",
};

export const CATEGORIES = Object.keys(CATEGORY_NAMES) as Category[];
