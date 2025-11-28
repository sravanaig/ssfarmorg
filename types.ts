
export interface Customer {
  id: string;
  name: string;
  address: string;
  phone: string;
  milkPrice: number;
  defaultQuantity: number;
  status: 'active' | 'inactive';
  previousBalance: number;
  balanceAsOfDate: string | null;
  userId?: string;
  email?: string;
  locationLat?: number;
  locationLng?: number;
}

export interface Delivery {
  id: number;
  customerId: string; // YYYY-MM-DD
  date: string;
  quantity: number;
  userId?: string;
}

export interface Order {
  id: number;
  customerId: string; // YYYY-MM-DD
  date: string;
  quantity: number;
  userId?: string;
}

export interface Payment {
  id: number;
  customerId: string; // YYYY-MM-DD
  date: string;
  amount: number;
  userId?: string;
}

export interface PendingDelivery {
  id: number;
  customerId: string;
  date: string;
  quantity: number;
  userId?: string;
}

export interface Profile {
  id: string;
  role: 'super_admin' | 'admin' | 'staff';
  status: 'pending' | 'approved' | 'rejected';
}

export interface ManagedUser {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'staff';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface WebsiteContent {
  heroSlides: { title: string; subtitle: string; image: string; }[];
  ourStory: { title: string; steps: { title: string; text: string; }[] };
  dairyFarm: { title: string; text: string; };
  whyChooseUs: { title: string; subtitle: string; features: { title: string; text: string; }[] };
  productsSection: { title: string; subtitle: string; };
  testimonials: { title: string; subtitle: string; list: { quote: string; name: string; role: string; }[] };
  founders: { title: string; subtitle:string; list: { name: string; title: string; bio: string; image: string; }[] };
  productsPage: {
    title: string;
    subtitle: string;
    products: {
      name: string;
      description: string;
      benefits: string[];
      image: string;
      feed?: string;
      extraction?: string;
      process?: string;
    }[];
  };
}