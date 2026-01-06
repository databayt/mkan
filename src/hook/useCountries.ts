// Stub hook for unused row components
import { CountrySelectValue } from "@/types/row-types";

function useCountries() {
  const countries: CountrySelectValue[] = [
    { value: 'US', label: 'United States', flag: '🇺🇸', latlng: [37.0902, -95.7129], region: 'Americas' },
    { value: 'CA', label: 'Canada', flag: '🇨🇦', latlng: [56.1304, -106.3468], region: 'Americas' },
    { value: 'GB', label: 'United Kingdom', flag: '🇬🇧', latlng: [55.3781, -3.4360], region: 'Europe' },
  ];

  const getAll = () => countries;

  const getByValue = (value: string) => {
    return countries.find((item) => item.value === value);
  };

  return { getAll, getByValue };
}

export default useCountries;
