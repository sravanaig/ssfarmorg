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
