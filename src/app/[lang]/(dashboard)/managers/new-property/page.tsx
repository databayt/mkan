"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import { CustomFormField } from "@/components/FormField";
import Header from "@/components/Header";
import { Form } from "@/components/ui/form";
import { PropertyFormData, propertySchema } from "@/lib/schemas";
import { useCreatePropertyMutation, useGetAuthUserQuery } from "@/state/api";
import { AmenityEnum, HighlightEnum, PropertyTypeEnum } from "@/lib/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { useForm } from "react-hook-form";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const NewProperty = () => {
  const [createProperty] = useCreatePropertyMutation();
  const { data: authUser } = useGetAuthUserQuery();
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");

  const form = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      name: "",
      description: "",
      pricePerNight: 100,
      securityDeposit: 500,
      applicationFee: 100,
      isPetsAllowed: true,
      isParkingIncluded: true,
      photoUrls: [],
      amenities: "",
      highlights: "",
      beds: 1,
      baths: 1,
      squareFeet: 1000,
      address: "",
      city: "",
      state: "",
      country: "",
      postalCode: "",
    },
  });

  const onSubmit = async (data: PropertyFormData) => {
    if (!authUser?.id) {
      throw new Error("No manager ID found");
    }

    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (key === "photoUrls") {
        const files = value as File[];
        files.forEach((file: File) => {
          formData.append("photos", file);
        });
      } else if (Array.isArray(value)) {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, String(value));
      }
    });

    formData.append("managerCognitoId", authUser.id);

    await createProperty(formData);
  };

  return (
    <div className="dashboard-container">
      <Header
        title={isAr ? "إضافة عقار جديد" : "Add New Property"}
        subtitle={isAr ? "إنشاء إعلان عقار جديد بمعلومات تفصيلية" : "Create a new property listing with detailed information"}
      />
      <div className="bg-white rounded-xl p-6">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="p-4 space-y-10"
          >
            {/* Basic Information */}
            <div>
              <h2 className="text-lg font-semibold mb-4">{isAr ? "المعلومات الأساسية" : "Basic Information"}</h2>
              <div className="space-y-4">
                <CustomFormField name="name" label={isAr ? "اسم العقار" : "Property Name"} />
                <CustomFormField
                  name="description"
                  label={isAr ? "الوصف" : "Description"}
                  type="textarea"
                />
              </div>
            </div>

            <hr className="my-6 border-gray-200" />

            {/* Fees */}
            <div className="space-y-6">
              <h2 className="text-lg font-semibold mb-4">{isAr ? "الرسوم" : "Fees"}</h2>
              <CustomFormField
                name="pricePerNight"
                label={isAr ? "السعر لليلة" : "Price per Night"}
                type="number"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CustomFormField
                  name="securityDeposit"
                  label={isAr ? "مبلغ التأمين" : "Security Deposit"}
                  type="number"
                />
                <CustomFormField
                  name="applicationFee"
                  label={isAr ? "رسوم الطلب" : "Application Fee"}
                  type="number"
                />
              </div>
            </div>

            <hr className="my-6 border-gray-200" />

            {/* Property Details */}
            <div className="space-y-6">
              <h2 className="text-lg font-semibold mb-4">{isAr ? "تفاصيل العقار" : "Property Details"}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <CustomFormField
                  name="beds"
                  label={isAr ? "عدد الأسرّة" : "Number of Beds"}
                  type="number"
                />
                <CustomFormField
                  name="baths"
                  label={isAr ? "عدد الحمامات" : "Number of Baths"}
                  type="number"
                />
                <CustomFormField
                  name="squareFeet"
                  label={isAr ? "المساحة (قدم مربع)" : "Square Feet"}
                  type="number"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <CustomFormField
                  name="isPetsAllowed"
                  label={isAr ? "يُسمح بالحيوانات" : "Pets Allowed"}
                  type="switch"
                />
                <CustomFormField
                  name="isParkingIncluded"
                  label={isAr ? "موقف سيارات متاح" : "Parking Included"}
                  type="switch"
                />
              </div>
              <div className="mt-4">
                <CustomFormField
                  name="propertyType"
                  label={isAr ? "نوع العقار" : "Property Type"}
                  type="select"
                  options={Object.keys(PropertyTypeEnum).map((type) => ({
                    value: type,
                    label: type,
                  }))}
                />
              </div>
            </div>

            <hr className="my-6 border-gray-200" />

            {/* Amenities and Highlights */}
            <div>
              <h2 className="text-lg font-semibold mb-4">
                {isAr ? "المرافق والمميزات" : "Amenities and Highlights"}
              </h2>
              <div className="space-y-6">
                <CustomFormField
                  name="amenities"
                  label={isAr ? "المرافق" : "Amenities"}
                  type="select"
                  options={Object.keys(AmenityEnum).map((amenity) => ({
                    value: amenity,
                    label: amenity,
                  }))}
                />
                <CustomFormField
                  name="highlights"
                  label={isAr ? "المميزات" : "Highlights"}
                  type="select"
                  options={Object.keys(HighlightEnum).map((highlight) => ({
                    value: highlight,
                    label: highlight,
                  }))}
                />
              </div>
            </div>

            <hr className="my-6 border-gray-200" />

            {/* Photos */}
            <div>
              <h2 className="text-lg font-semibold mb-4">{isAr ? "الصور" : "Photos"}</h2>
              <CustomFormField
                name="photoUrls"
                label={isAr ? "صور العقار" : "Property Photos"}
                type="file"
                accept="image/*"
              />
            </div>

            <hr className="my-6 border-gray-200" />

            {/* Additional Information */}
            <div className="space-y-6">
              <h2 className="text-lg font-semibold mb-4">
                {isAr ? "معلومات إضافية" : "Additional Information"}
              </h2>
              <CustomFormField name="address" label={isAr ? "العنوان" : "Address"} />
              <div className="flex justify-between gap-4">
                <CustomFormField name="city" label={isAr ? "المدينة" : "City"} className="w-full" />
                <CustomFormField
                  name="state"
                  label={isAr ? "الولاية" : "State"}
                  className="w-full"
                />
                <CustomFormField
                  name="postalCode"
                  label={isAr ? "الرمز البريدي" : "Postal Code"}
                  className="w-full"
                />
              </div>
              <CustomFormField name="country" label={isAr ? "الدولة" : "Country"} />
            </div>

            <Button
              type="submit"
              className="bg-primary-700 text-white w-full mt-8"
            >
              {isAr ? "إنشاء العقار" : "Create Property"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
};

export default NewProperty;
