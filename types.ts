export interface Customer {
  id: number;
  name: string;
  address: string;
  phone: string;
  milkPrice: number;
  defaultQuantity: number;
  userId?: string;
}

export interface Delivery {
  id: number;
  customerId: number;
  date: string; // YYYY-MM-DD
  quantity: number;
  userId?: string;
}

export interface Payment {
  id: number;
  customerId: number;
  date: string; // YYYY-MM-DD
  amount: number;
  userId?: string;
}

export interface WebsiteContent {
  heroSlides: { title: string; subtitle: string; image: string; }[];
  ourStory: { title: string; steps: { title: string; text: string; }[] };
  dairyFarm: { title: string; text: string; };
  whyChooseUs: { title: string; subtitle: string; features: { title: string; text: string; }[] };
  productsSection: { title: string; subtitle: string; };
  testimonials: { title: string; subtitle: string; list: { quote: string; name: string; role: string; }[] };
  founders: { title: string; subtitle: string; list: { name: string; title: string; bio: string; }[] };
  productsPage: { title: string; subtitle: string; products: { name: string; description: string; benefits: string[]; image: string; }[] };
}