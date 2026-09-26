import { ShoppingBasket, Utensils, ShoppingBag, Lightbulb, Smartphone, TrainFront, Home, HeartPulse, Gamepad2, Tag, Coffee, BookOpen, Shirt, Plane, Gift, PawPrint, type LucideIcon } from 'lucide-react';
import { Car, Bike, Bus, Fuel, ParkingCircle, Hotel, MapPin, Umbrella, Droplets, Flame, Wifi, Laptop, Sofa, Wrench, Scissors, Sparkles, Pill, Stethoscope, Baby, GraduationCap, Music, Film, Dumbbell, Wallet } from 'lucide-react';
import { type CategoryIconName, validCategoryIcon } from './category-appearance';
const icons:Record<CategoryIconName,LucideIcon>={basket:ShoppingBasket,utensils:Utensils,shopping:ShoppingBag,lightbulb:Lightbulb,phone:Smartphone,train:TrainFront,home:Home,heart:HeartPulse,gamepad:Gamepad2,tag:Tag,coffee:Coffee,book:BookOpen,shirt:Shirt,plane:Plane,gift:Gift,paw:PawPrint,car:Car,bike:Bike,bus:Bus,fuel:Fuel,parking:ParkingCircle,hotel:Hotel,map:MapPin,beach:Umbrella,water:Droplets,flame:Flame,wifi:Wifi,laptop:Laptop,sofa:Sofa,wrench:Wrench,scissors:Scissors,sparkles:Sparkles,pill:Pill,stethoscope:Stethoscope,baby:Baby,graduation:GraduationCap,music:Music,film:Film,dumbbell:Dumbbell,wallet:Wallet};
export function CategoryIcon({name,color,size=20}:{name:string;color?:string;size?:number}) {
  const Icon=icons[validCategoryIcon(name)?name:'tag'];
  return <Icon size={size} color={color} aria-hidden="true"/>;
}
