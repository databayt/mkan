// Stub hook for unused row components
import { useState, useCallback } from 'react';

interface UseLoginModalReturn {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

function useLoginModel(): UseLoginModalReturn {
  const [isOpen, setIsOpen] = useState(false);

  const onOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  const onClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    onOpen,
    onClose,
  };
}

export default useLoginModel;
