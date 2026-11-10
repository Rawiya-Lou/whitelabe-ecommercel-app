import { product } from "./product";
import { category } from "./category";
import { uiTranslation } from "./uiTranslation";
import { siteSetting } from "./siteSetting";
import { pageSeo } from "./pageSeo";
import {  heroSection} from "./heroSection";

import { localizedString, localizedText } from "./localizedObjects";

export const schemaTypes = [
  uiTranslation,
  siteSetting,
  heroSection,
  pageSeo,
  localizedString,
  localizedText,
  category,
  product,
];
