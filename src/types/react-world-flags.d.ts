// Stub type declarations for react-world-flags
declare module "react-world-flags" {
  import { ComponentType } from "react";

  interface FlagProps {
    code?: string;
    fallback?: React.ReactNode;
    height?: string | number;
    width?: string | number;
    className?: string;
    style?: React.CSSProperties;
  }

  const Flag: ComponentType<FlagProps>;
  export default Flag;
}
