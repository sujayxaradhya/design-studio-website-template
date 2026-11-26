// Facts used by more than one section. Placeholders: replace with the studio's real ones (see AGENTS.md).
export const email = 'hello@onda.example';
export const careers = 'careers@onda.example';

export const offices = [
  { city: 'Lisbon', address: ['Rua do Exemplo 1', '1200-000 Lisbon'], phone: '+351 210 000 000' },
  { city: 'Brooklyn', address: ['100 Example Street', 'Brooklyn, NY 11200'], phone: '+1 718 000 0000' },
];

export const tel = (phone: string) => `tel:${phone.replace(/\s/g, '')}`;

// Header, phone menu and footer links.
export const nav = [
  { href: '#work', label: 'Work' },
  { href: '#capabilities', label: 'Services' },
  { href: '#method', label: 'Approach' },
  { href: '#studio', label: 'Studio' },
  { href: '#journal', label: 'Journal' },
];
