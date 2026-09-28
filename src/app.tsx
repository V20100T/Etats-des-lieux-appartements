import { useRoute } from './ui/commun';
import { Accueil } from './ui/accueil';
import { EcranLogement } from './ui/logement';
import { EcranEdl } from './ui/edl';
import { EcranReglages } from './ui/reglages';

export function App() {
  const [ecran, id, ...sous] = useRoute();
  let contenu;
  if (ecran === 'logement' && id) contenu = <EcranLogement id={id} />;
  else if (ecran === 'edl' && id) contenu = <EcranEdl id={id} sous={sous} />;
  else if (ecran === 'reglages') contenu = <EcranReglages />;
  else contenu = <Accueil />;
  return <main class="container">{contenu}</main>;
}
