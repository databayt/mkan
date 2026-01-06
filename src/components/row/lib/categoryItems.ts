// Stub file for unused row components

export interface CategoryItem {
  id: number;
  name: string;
  title: string;
  imageUrl: string;
  description: string;
}

export const categoryItems: CategoryItem[] = [
  {
    id: 1,
    name: "Beach",
    title: "Beach",
    imageUrl: "/airbnb/Beach.svg",
    description: "Beach properties"
  },
  {
    id: 2,
    name: "Modern",
    title: "Modern",
    imageUrl: "/airbnb/Mension.svg",
    description: "Modern homes"
  },
  {
    id: 3,
    name: "Countryside",
    title: "Countryside",
    imageUrl: "/airbnb/Windmill.svg",
    description: "Country retreats"
  },
  {
    id: 4,
    name: "Islands",
    title: "Islands",
    imageUrl: "/airbnb/Islands.svg",
    description: "Island getaways"
  },
  {
    id: 5,
    name: "Pools",
    title: "Amazing Pools",
    imageUrl: "/airbnb/Pool.svg",
    description: "Properties with pools"
  },
];
