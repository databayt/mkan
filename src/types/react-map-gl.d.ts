// Stub type declarations for unused react-map-gl
declare module "react-map-gl" {
  import { ReactNode, ComponentType } from "react";

  interface MapProps {
    initialViewState?: {
      longitude?: number;
      latitude?: number;
      zoom?: number;
    };
    style?: React.CSSProperties;
    mapStyle?: string;
    mapboxAccessToken?: string;
    children?: ReactNode;
    [key: string]: any;
  }

  const ReactMapGL: ComponentType<MapProps>;
  export default ReactMapGL;
  export const Marker: ComponentType<{ longitude: number; latitude: number; children?: ReactNode }>;
  export const NavigationControl: ComponentType<{ position?: string }>;
}
