import '@testing-library/jest-dom';
import i18n from '../i18n';
import {fetch,Headers,Request,Response} from 'cross-fetch';
Object.assign(globalThis,{fetch,Headers,Request,Response});

// Tests assert Portuguese labels; jsdom reports en-US for navigator.language.
void i18n.changeLanguage('pt');
