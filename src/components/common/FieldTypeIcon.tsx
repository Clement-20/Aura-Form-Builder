import React from 'react';
import {
  TextT,
  Article,
  EnvelopeSimple,
  Phone,
  LinkSimple,
  RadioButton,
  CheckSquare,
  CaretCircleDown,
  Star,
  SlidersHorizontal,
  Hash,
  CalendarBlank,
  Info,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { FieldType } from '../../types/form';

export interface FieldTypeMeta {
  type: FieldType;
  label: string;
  shortLabel: string;
  hint: string;
  category: 'Basics' | 'Contact' | 'Choices' | 'Ratings' | 'Numbers & Dates';
  icon: Icon;
}

export const FIELD_TYPE_META: Record<FieldType, FieldTypeMeta> = {
  text: {
    type: 'text',
    label: 'Short Answer',
    shortLabel: 'Short Text',
    hint: 'Names, titles, or brief replies',
    category: 'Basics',
    icon: TextT,
  },
  textarea: {
    type: 'textarea',
    label: 'Long Answer',
    shortLabel: 'Paragraph',
    hint: 'Detailed feedback or stories',
    category: 'Basics',
    icon: Article,
  },
  statement: {
    type: 'statement',
    label: 'Note / Section Info',
    shortLabel: 'Note',
    hint: 'Display instructions without an input',
    category: 'Basics',
    icon: Info,
  },
  email: {
    type: 'email',
    label: 'Email Address',
    shortLabel: 'Email',
    hint: 'Validates real email format automatically',
    category: 'Contact',
    icon: EnvelopeSimple,
  },
  phone: {
    type: 'phone',
    label: 'Phone Number',
    shortLabel: 'Phone',
    hint: 'Collect mobile or office contact numbers',
    category: 'Contact',
    icon: Phone,
  },
  url: {
    type: 'url',
    label: 'Website Link',
    shortLabel: 'Website',
    hint: 'Portfolios, social profiles, or links',
    category: 'Contact',
    icon: LinkSimple,
  },
  radio: {
    type: 'radio',
    label: 'Single Choice',
    shortLabel: 'Choice',
    hint: 'Pick one option from a list',
    category: 'Choices',
    icon: RadioButton,
  },
  checkbox: {
    type: 'checkbox',
    label: 'Multiple Choice',
    shortLabel: 'Checkboxes',
    hint: 'Select as many options as apply',
    category: 'Choices',
    icon: CheckSquare,
  },
  select: {
    type: 'select',
    label: 'Dropdown Menu',
    shortLabel: 'Dropdown',
    hint: 'Compact menu for longer option lists',
    category: 'Choices',
    icon: CaretCircleDown,
  },
  rating: {
    type: 'rating',
    label: 'Star Rating (1–5)',
    shortLabel: 'Star Rating',
    hint: 'Quick 5-star satisfaction score',
    category: 'Ratings',
    icon: Star,
  },
  scale: {
    type: 'scale',
    label: 'Number Scale (0–10)',
    shortLabel: 'Scale 0–10',
    hint: 'Great for NPS & recommendation scores',
    category: 'Ratings',
    icon: SlidersHorizontal,
  },
  number: {
    type: 'number',
    label: 'Number',
    shortLabel: 'Number',
    hint: 'Quantities, budgets, or ages',
    category: 'Numbers & Dates',
    icon: Hash,
  },
  date: {
    type: 'date',
    label: 'Date Picker',
    shortLabel: 'Date',
    hint: 'Bookings, birthdays, or deadlines',
    category: 'Numbers & Dates',
    icon: CalendarBlank,
  },
};

export const FIELD_CATEGORIES: {
  category: FieldTypeMeta['category'];
  items: FieldTypeMeta[];
}[] = [
  {
    category: 'Basics',
    items: [FIELD_TYPE_META.text, FIELD_TYPE_META.textarea, FIELD_TYPE_META.statement],
  },
  {
    category: 'Choices',
    items: [FIELD_TYPE_META.radio, FIELD_TYPE_META.checkbox, FIELD_TYPE_META.select],
  },
  {
    category: 'Contact',
    items: [FIELD_TYPE_META.email, FIELD_TYPE_META.phone, FIELD_TYPE_META.url],
  },
  {
    category: 'Ratings',
    items: [FIELD_TYPE_META.rating, FIELD_TYPE_META.scale],
  },
  {
    category: 'Numbers & Dates',
    items: [FIELD_TYPE_META.date, FIELD_TYPE_META.number],
  },
];

interface FieldTypeIconProps {
  type: FieldType;
  size?: number;
  className?: string;
}

export const FieldTypeIcon: React.FC<FieldTypeIconProps> = ({
  type,
  size = 16,
  className = '',
}) => {
  const IconComp = FIELD_TYPE_META[type]?.icon || TextT;
  return <IconComp size={size} weight="light" className={className} />;
};
