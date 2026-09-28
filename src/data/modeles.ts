import type { ModeleElement, ModeleLogement, ModelePiece, Reglages } from '../model/types';

const e = (nom: string, commentaire = '', quantite = 1): ModeleElement => ({ nom, quantite, commentaire });
const liste = (...noms: string[]) => noms.map((n) => e(n));

const BASE = ['Porte', 'Sol', 'Murs', 'Plafond', 'Plinthes', 'Fenêtres', 'Volets', 'Interrupteurs', 'Prises', 'Eclairage'];

export const MODELES_PIECES: ModelePiece[] = [
  { id: 'entree', nom: 'Entrée', elements: liste("Porte d'entrée", 'Serrure', 'Sol', 'Murs', 'Plafond', 'Plinthes', 'Interrupteurs', 'Prises', 'Eclairage', 'Interphone', 'Placard') },
  { id: 'sejour', nom: 'Séjour', elements: liste(...BASE, 'Radiateur', 'Prise TV', 'Prise RJ45') },
  { id: 'chambre', nom: 'Chambre', elements: liste(...BASE, 'Radiateur', 'Placard') },
  { id: 'cuisine', nom: 'Cuisine', elements: liste(...BASE, 'Evier et robinetterie', 'Plan de travail', 'Meubles hauts', 'Meubles bas', 'Plaques de cuisson', 'Four', 'Hotte', 'Réfrigérateur', 'Ventilation') },
  { id: 'sdb', nom: 'Salle de bain', elements: liste('Porte', 'Sol', 'Murs', 'Plafond', 'Faïence', 'Joints', 'Lavabo et robinetterie', 'Douche / baignoire', 'Paroi / rideau', 'Miroir', 'Rangements', 'Sèche-serviettes', 'Ventilation', 'Eclairage', 'Prises') },
  { id: 'wc', nom: 'WC', elements: liste('Porte', 'Sol', 'Murs', 'Plafond', 'Cuvette et abattant', "Chasse d'eau", 'Lave-mains', 'Ventilation', 'Eclairage') },
  { id: 'chauffage', nom: 'Equipements de chauffage', elements: liste("Ballon d'eau chaude", 'Chaudière', 'Radiateurs', 'Thermostat') },
  { id: 'exterieur', nom: 'Extérieurs et annexes', elements: liste('Balcon / terrasse', 'Cave', 'Parking', 'Boîte aux lettres', 'Interphone') },
  { id: 'vide', nom: 'Pièce vide', elements: [] },
];

export const VERIFICATIONS_DEFAUT = [
  'Détecteur de fumée',
  'Chaudière / chauffe-eau',
  'Boîte aux lettres',
  'Interphone',
];

export const CLES_DEFAUT: ModeleElement[] = [
  e("Clés porte d'entrée", '', 2),
  e('Clés boîte aux lettres', '', 1),
  e('Badge immeuble', '', 1),
  e('Télécommande', '', 0),
];

export const MENTIONS_DEFAUT =
  "Rédigé de façon contradictoire entre le propriétaire et le locataire lors de la remise des clés et lors de leur restitution au départ du locataire conformément à l'article 3 de la Loi N°89-462 du 6 juillet 1989 et au décret N° 2016-382 du 30 mars 2016. Cet état des lieux ne peut être dissocié du contrat de location.\n\n" +
  "Il appartient au locataire d'assurer l'entretien courant du logement et les menues réparations nécessaires. A défaut, et sauf s'il est prouvé que la dégradation est due à la vétusté du logement, à une malfaçon ou à un cas de force majeure, le bailleur sera en droit de retenir sur le dépôt de garantie le montant des réparations locatives n'ayant pas été effectuées.\n\n" +
  "Le locataire dispose d'un délai de 10 jours pour demander au bailleur de compléter le présent état des lieux (pour l'état de l'équipement de chauffe, le délai est porté au 1er mois de la période de chauffe).";

export const REGLAGES_DEFAUT: Reglages = {
  bailleur: { nom: '', adresse: '' },
  faitA: '',
  mentions: MENTIONS_DEFAUT,
};

/** Modèle « studio 19 m² avec terrasse », repris d'un EDL Excel existant (sans adresse). */
export const STUDIO_TERRASSE: ModeleLogement = {
  id: 'studio-terrasse',
  nom: 'Studio 19 m² avec terrasse',
  adresse: '',
  description: 'Studio de 19 m²',
  pieces: [
    {
      nom: 'Equipement de chauffage',
      elements: [e("Ballon d'eau chaude"), e('Radiateur électrique'), e('Radiateur sèche-serviettes')],
    },
    {
      nom: 'Entrée, coin nuit et cuisine',
      elements: [
        e("Porte d'entrée", 'Bois'),
        e('Sols', 'PVC'),
        e('Murs', 'Peinture beige'),
        e('Plafond', 'Peinture blanche'),
        e('Portes intérieures', "Salle d'eau"),
        e('Fenêtres cuisine', 'Bois'),
        e('Porte fenêtre', 'Double vitrage'),
        e('Plinthes', 'Plastiques'),
        e('Ventilation', 'VMC'),
        e('Interrupteurs', '5 interrupteurs'),
        e('Prises', '13 prises'),
        e('Eclairage', '1 luminaire rond en verre et 2 spots 2 ampoules'),
        e('Prise RJ45'),
        e('Prise téléphone'),
        e('Interphone avec combiné'),
        e('Détecteur de fumée'),
        e('Evier inox sur meuble'),
        e('2 plaques de cuisson électriques'),
        e('Eléments hauts cuisine', '2 meubles 40x80 IKEA'),
        e('Etagères aggloméré', '3 étagères'),
      ],
    },
    {
      nom: "Salle d'eau",
      elements: liste('Sols', 'Murs', 'Porte', 'Ventilation', 'Eclairage', 'Joints', 'Rangements', 'Lavabo et robinets'),
    },
    {
      nom: 'Eléments extérieurs et autres',
      elements: [
        e('Terrasse', 'Dalles caillebotis bois et rambarde classée'),
        e('Interphone'),
        e('Boîte aux lettres'),
        e('Isolation', 'Aux normes en vigueur à la rénovation en 2020 - DPE C'),
      ],
    },
  ],
  cles: [
    e("Porte d'entrée appartement"),
    e('Porte fenêtre accès terrasse'),
    e('Porte accès immeuble'),
    e('Badge Vigik accès immeuble'),
    e('Boîte aux lettres'),
  ],
  compteurs: [
    { type: 'eau', nom: 'Eau divisionnaire (palier)', numero: '101' },
    { type: 'electricite', nom: 'Electricité' },
  ],
};

export const MODELES_LOGEMENTS: ModeleLogement[] = [STUDIO_TERRASSE];
