import 'dotenv/config';
import mongoose from 'mongoose';
import Faq from '../models/Faq.js';

const faqs = [
  {
    question: 'What services does RSP UK provide?',
    answer:
      'RSP UK offers custom signage, commercial printing, window graphics, fabrication, and professional print products for businesses across Middlesbrough, Teesside, and the UK.',
  },
  {
    question: 'Do you create bespoke signage?',
    answer: 'Yes. Every project is custom-designed to match your branding, dimensions, and business objectives.',
  },
  {
    question: 'Do you offer design services?',
    answer:
      'Yes. Our experienced design team can create artwork from scratch or prepare your existing files for professional production.',
  },
  {
    question: 'Can you install signs?',
    answer: 'Yes. We provide professional installation for many signage solutions, ensuring a safe and high-quality finish.',
  },
  {
    question: 'What materials do you use?',
    answer:
      'We work with premium materials including acrylic, aluminium composite, Foamex, Correx, PVC, vinyl, canvas, and precision-cut metals, selecting the most suitable option for each project.',
  },
  {
    question: 'Do you provide large format printing?',
    answer:
      'Yes. We produce posters, banners, exhibition graphics, promotional displays, Correx boards, Foamex signs, and other large-format print products.',
  },
  {
    question: 'Which businesses do you work with?',
    answer:
      'We work with retailers, restaurants, schools, healthcare providers, offices, construction companies, manufacturers, hospitality businesses, automotive companies, and many other commercial organisations.',
  },
  {
    question: 'Do you deliver outside Middlesbrough?',
    answer:
      "Yes. While we're based in Middlesbrough and proudly serve Teesside and the North East, we also provide reliable nationwide delivery across the UK.",
  },
  {
    question: 'How long does production take?',
    answer:
      "Production times vary depending on the project, materials, and finishing requirements. We'll provide an estimated turnaround time when preparing your quotation.",
  },
  {
    question: 'How do I request a quotation?',
    answer:
      "Simply contact our team by phone, email, or our online enquiry form with your project details, and we'll provide a free, no-obligation quotation.",
  },
];

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const existing = await Faq.find().lean();
  console.log(`Existing FAQ count: ${existing.length}`);

  const isPlaceholder =
    existing.length > 0 &&
    existing.every((doc) => /^what is rsp\.?$/i.test(doc.question.trim()));

  if (existing.length > 0 && !isPlaceholder) {
    console.log('Real FAQs already exist — skipping seed to avoid overwriting admin content.');
  } else {
    if (isPlaceholder) {
      await Faq.deleteMany({ _id: { $in: existing.map((doc) => doc._id) } });
      console.log('Removed placeholder FAQ entries.');
    }
    const docs = faqs.map((faq, index) => ({ ...faq, displayOrder: index, isActive: true }));
    await Faq.insertMany(docs);
    console.log(`Inserted ${docs.length} FAQs.`);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
