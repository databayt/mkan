import { create } from 'zustand';

interface ModalStore {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const createModalStore = () => 
  create<ModalStore>((set) => ({
    isOpen: false,
    onOpen: () => set({ isOpen: true }),
    onClose: () => set({ isOpen: false }),
  }));

export const useLoginModal = createModalStore();
export const useRegisterModal = createModalStore();
export const useRentModal = createModalStore();
export const useSearchModal = createModalStore(); 