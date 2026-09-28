import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import '@picocss/pico/css/pico.min.css';
import './styles.css';
import { App } from './app';
import { demanderPersistance } from './storage/db';

registerSW({ immediate: true });
demanderPersistance();

render(<App />, document.getElementById('app')!);
