import Link from "next/link"

export default function Article() {
  const articles = [
    {
      title: "Cancel your home reservation as a guest",
      description: "Your plans have changed and now you need to cancel your home reservation. ...",
    },
    {
      title: "Change the date or time of your service or experience reservation",
      description: "If you booked a service or experience, but the date or time no longer works for you...",
    },
    {
      title: "If your host cancels your home reservation",
      description: "While it's rare, sometimes a host may need to cancel a reservation. We...",
    },
    {
      title: "Payment methods accepted",
      description: "Mkan accepts a variety of payment methods. However, your available optio...",
    },
    {
      title: "Add or remove a payment method",
      description: "If an existing payment method on your account is incorrect (ex: an expired cred...",
    },
    {
      title: "When you'll pay for your reservation",
      description: "Want to know when you'll be charged for a reservation? It all depends on the type...",
    },
  ]

  return (
    <div className="py-8">
      <h1 className="text-3xl font-semibold text-gray-900 mb-8">Top articles</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {articles.map((article, index) => (
          <div key={index} className="space-y-3 pb-6 border-b border-gray-200">
            <Link href="#" className="text-lg font-medium text-gray-900 hover:text-gray-700 underline block">
              {article.title}
            </Link>
            <p className="text-gray-600 leading-relaxed line-clamp-2">{article.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
