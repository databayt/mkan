"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function Toast() {
    const params = useSearchParams();
    useEffect(() => {
        const error = params?.get("error");
        const success = params?.get("success");
        if (error) {
            toast.error(error, { type: "error", theme: "colored" });
        } else if (success) {
            toast.success(success, { theme: "colored" });
        }
    }, [params]);

    return (
        <>
            <ToastContainer />
        </>
    );
}