'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import {
  MapPin,
  Clock,
  Calendar,
  CreditCard,
  Smartphone,
  Building2,
  Banknote,
  ArrowRight,
  Shield,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getBooking, processPayment } from '@/lib/actions/transport-actions';
import { useLocale } from '@/components/internationalization/use-locale';

type PaymentMethod = 'MobileMoney' | 'CreditCard' | 'BankTransfer' | 'CashOnArrival';

interface BookingDetails {
  id: number;
  bookingReference: string;
  passengerName: string;
  passengerPhone: string;
  totalAmount: number;
  status: string;
  trip: {
    departureDate: Date;
    departureTime: string;
    price: number;
    route: {
      origin: { name: string; city: string };
      destination: { name: string; city: string };
      duration: number;
      office: {
        name: string;
        phone: string;
      };
    };
    bus: {
      plateNumber: string;
      model: string | null;
    };
  };
  seats: { seatNumber: string }[];
}

// Payment method translations
const paymentMethodTranslations = {
  en: {
    checkout: {
      title: 'Complete Your Booking',
      selectPayment: 'Select Payment Method',
      choosePayment: 'Choose how you would like to pay',
      orderSummary: 'Order Summary',
      bookingNotFound: 'Booking not found',
      backToTransport: 'Back to Transport',
      paySecure: 'Your payment is secure and encrypted',
      mobileMoneyDetails: 'Mobile Money Details',
      enterMobileNumber: 'Enter your mobile money number',
      mobileNumber: 'Mobile Number',
      bankDetails: 'Bank Transfer Details',
      transferTo: 'Transfer to the following account',
      bankName: 'Bank Name',
      accountName: 'Account Name',
      accountNumber: 'Account Number',
      reference: 'Reference',
      includeReference: 'Please include the booking reference in your transfer description. Your booking will be confirmed once payment is verified.',
      cashTitle: 'Cash on Arrival',
      cashSubtitle: 'Pay at the transport office',
      cashWarning: 'Your seats will be reserved for 30 minutes. Please arrive at the office early to complete payment and collect your tickets.',
      passenger: 'Passenger',
      seats: 'Seats',
      total: 'Total',
      processing: 'Processing...',
      pay: 'Pay',
    },
    paymentMethods: {
      mobileMoney: { name: 'Mobile Money', description: 'Pay with MTN or Bankak' },
      creditCard: { name: 'Credit/Debit Card', description: 'Visa, Mastercard' },
      bankTransfer: { name: 'Bank Transfer', description: 'Direct bank transfer' },
      cashOnArrival: { name: 'Cash on Arrival', description: 'Pay at the office' },
    },
  },
  ar: {
    checkout: {
      title: 'أكمل حجزك',
      selectPayment: 'اختر طريقة الدفع',
      choosePayment: 'اختر كيف تريد الدفع',
      orderSummary: 'ملخص الطلب',
      bookingNotFound: 'الحجز غير موجود',
      backToTransport: 'العودة إلى النقل',
      paySecure: 'دفعتك آمنة ومشفرة',
      mobileMoneyDetails: 'تفاصيل الدفع بالموبايل',
      enterMobileNumber: 'أدخل رقم الموبايل للدفع',
      mobileNumber: 'رقم الموبايل',
      bankDetails: 'تفاصيل التحويل البنكي',
      transferTo: 'حول إلى الحساب التالي',
      bankName: 'اسم البنك',
      accountName: 'اسم الحساب',
      accountNumber: 'رقم الحساب',
      reference: 'المرجع',
      includeReference: 'يرجى تضمين رقم الحجز في وصف التحويل. سيتم تأكيد حجزك بمجرد التحقق من الدفع.',
      cashTitle: 'الدفع عند الوصول',
      cashSubtitle: 'ادفع في مكتب النقل',
      cashWarning: 'سيتم حجز مقاعدك لمدة 30 دقيقة. يرجى الوصول إلى المكتب مبكراً لإتمام الدفع واستلام تذاكرك.',
      passenger: 'المسافر',
      seats: 'المقاعد',
      total: 'الإجمالي',
      processing: 'جاري المعالجة...',
      pay: 'ادفع',
    },
    paymentMethods: {
      mobileMoney: { name: 'الدفع بالموبايل', description: 'ادفع عبر MTN أو بنكك' },
      creditCard: { name: 'بطاقة ائتمان/خصم', description: 'فيزا، ماستركارد' },
      bankTransfer: { name: 'تحويل بنكي', description: 'تحويل بنكي مباشر' },
      cashOnArrival: { name: 'الدفع عند الوصول', description: 'ادفع في المكتب' },
    },
  },
} as const;

type Locale = 'en' | 'ar';

function CheckoutInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const bookingId = Number(searchParams.get('bookingId'));

  // Get locale from pathname
  const pathParts = pathname.split('/');
  const locale = (pathParts[1] === 'ar' ? 'ar' : 'en') as Locale;
  const t = paymentMethodTranslations[locale];

  // Build payment methods with translated content
  const paymentMethods = [
    { id: 'MobileMoney' as PaymentMethod, name: t.paymentMethods.mobileMoney.name, description: t.paymentMethods.mobileMoney.description, icon: Smartphone },
    { id: 'CreditCard' as PaymentMethod, name: t.paymentMethods.creditCard.name, description: t.paymentMethods.creditCard.description, icon: CreditCard },
    { id: 'BankTransfer' as PaymentMethod, name: t.paymentMethods.bankTransfer.name, description: t.paymentMethods.bankTransfer.description, icon: Building2 },
    { id: 'CashOnArrival' as PaymentMethod, name: t.paymentMethods.cashOnArrival.name, description: t.paymentMethods.cashOnArrival.description, icon: Banknote },
  ];

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('MobileMoney');
  const [mobileNumber, setMobileNumber] = useState('');

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const data = await getBooking(bookingId);
        setBooking(data as unknown as BookingDetails | null);
      } catch (error) {
        console.error('Failed to fetch booking:', error);
      } finally {
        setLoading(false);
      }
    };

    if (bookingId) {
      fetchBooking();
    }
  }, [bookingId]);

  const handlePayment = async () => {
    if (!booking) return;

    setProcessing(true);
    try {
      const result = await processPayment(booking.id, {
        method: paymentMethod,
        mobileMoneyNumber: paymentMethod === 'MobileMoney' ? mobileNumber : undefined,
      });

      if (result.success) {
        toast.success(locale === 'ar' ? 'تم الدفع بنجاح' : 'Payment successful');
        router.push(`/${locale}/transport/booking/${booking.id}`);
      } else {
        toast.error(locale === 'ar' ? 'فشل الدفع' : 'Payment failed. Please try again.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment failed';
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">{t.checkout.bookingNotFound}</h1>
        <Button onClick={() => router.push(`/${locale}/transport`)} className="mt-4">
          {t.checkout.backToTransport}
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">{t.checkout.title}</h1>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Payment Methods */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.checkout.selectPayment}</CardTitle>
              <CardDescription>{t.checkout.choosePayment}</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                className="space-y-3"
              >
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  return (
                    <div key={method.id}>
                      <Label
                        htmlFor={method.id}
                        className="flex items-center gap-4 p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors [&:has(:checked)]:border-primary [&:has(:checked)]:bg-primary/5"
                      >
                        <RadioGroupItem value={method.id} id={method.id} />
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium">{method.name}</div>
                          <div className="text-sm text-muted-foreground">{method.description}</div>
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>

          {paymentMethod === 'MobileMoney' && (
            <Card>
              <CardHeader>
                <CardTitle>{t.checkout.mobileMoneyDetails}</CardTitle>
                <CardDescription>{t.checkout.enterMobileNumber}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="mobile">{t.checkout.mobileNumber}</Label>
                  <Input id="mobile" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} placeholder="e.g., 0912345678" dir="ltr" />
                </div>
              </CardContent>
            </Card>
          )}

          {paymentMethod === 'BankTransfer' && (
            <Card>
              <CardHeader>
                <CardTitle>{t.checkout.bankDetails}</CardTitle>
                <CardDescription>{t.checkout.transferTo}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t.checkout.bankName}</span><span className="font-medium">Bank of Khartoum</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t.checkout.accountName}</span><span className="font-medium">Mkan Transport Services</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t.checkout.accountNumber}</span><span className="font-medium font-mono" dir="ltr">1234567890</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t.checkout.reference}</span><span className="font-medium font-mono" dir="ltr">{booking.bookingReference}</span></div>
                </div>
                <p className="text-sm text-muted-foreground">{t.checkout.includeReference}</p>
              </CardContent>
            </Card>
          )}

          {paymentMethod === 'CashOnArrival' && (
            <Card>
              <CardHeader>
                <CardTitle>{t.checkout.cashTitle}</CardTitle>
                <CardDescription>{t.checkout.cashSubtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-200">{t.checkout.cashWarning}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Button className="w-full" size="lg" onClick={handlePayment} disabled={processing || (paymentMethod === 'MobileMoney' && !mobileNumber)}>
            {processing ? t.checkout.processing : `${t.checkout.pay} SDG ${booking.totalAmount.toLocaleString()}`}
          </Button>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>{t.checkout.paySecure}</span>
          </div>
        </div>

        {/* Order Summary */}
        <div className="md:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>{t.checkout.orderSummary}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {booking.trip.route.origin.city}
                  <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                  {booking.trip.route.destination.city}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span dir="ltr">{format(new Date(booking.trip.departureDate), 'EEE, MMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span dir="ltr">{booking.trip.departureTime}</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{t.checkout.passenger}</span><span>{booking.passengerName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t.checkout.seats}</span><span dir="ltr">{booking.seats.map((s) => s.seatNumber).join(', ')}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t.checkout.reference}</span><span className="font-mono text-xs" dir="ltr">{booking.bookingReference}</span></div>
              </div>

              <Separator />

              <div className="flex justify-between font-bold">
                <span>{t.checkout.total}</span>
                <span dir="ltr">SDG {booking.totalAmount.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CheckoutFallback() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-96 bg-muted rounded" />
      </div>
    </div>
  );
}

export default function CheckoutContent() {
  return (
    <Suspense fallback={<CheckoutFallback />}>
      <CheckoutInner />
    </Suspense>
  );
}
