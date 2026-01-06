// Stub typings for unused row components

export interface ICountry {
  value: string;
  label: string;
  flag: string;
  latlng: [number, number];
  region: string;
}

export enum EHeaderOpions {
  LOCATION = 'LOCATION',
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
  GUESTS = 'GUESTS',
  FIND_EXPERIENCES = 'FIND_EXPERIENCES',
  PLACES_TO_STAY = 'PLACES_TO_STAY',
}

export interface IExploreNearby {
  id: string;
  location: string;
  distance: string;
  img: string;
}
