export type ServiceOption = { id: string; name: string; duration: string; price: number };

export type BookingService = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  imageUrl: string | null;
  rating: number;
  duration: string;
  options: ServiceOption[];
};

export const FALLBACK_SERVICE: BookingService = {
  id: 'nails-by-daniella',
  name: 'Nails by Daniella',
  category: 'Beauty',
  description: 'Perfect nail design sessions',
  price: 2000,
  imageUrl: null,
  rating: 4.9,
  duration: '50–80 mins',
  options: [
    { id: 'classic-styles', name: 'Classic styles', duration: '60 minutes', price: 2000 },
    { id: 'gel-polish-removal', name: 'Gel polish removal', duration: '10 minutes', price: 500 },
    { id: 'gel-refill', name: 'Gel refill', duration: '20 minutes', price: 3500 },
  ],
};
