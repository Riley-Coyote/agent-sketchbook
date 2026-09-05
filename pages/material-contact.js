import { createPracticeDrawing } from '../practice.js';

const study = createPracticeDrawing();
export default {
  title: study.title,
  date: '2026-09-05',
  page: study.page,
  surface: study.surface,
  seed: study.surface.seed,
  note: 'A calibration sheet for the new dry materials. Each example is made of timed contact samples, with pressure and pencil angle chosen explicitly. The first inspection showed faint captions, an unhelpful tilt direction, and a detached sphere shadow. The next pass strengthened the writing, turned the pencil across the movement to broaden its contact, and brought the shadow under the form. Repeated passes meet the same paper grain. The blending stump carries loose charcoal into untouched paper; the two erasers lift it in different ways. This is an empirical dry-media model, with practice observations saved separately in the studio library.',
  build: () => createPracticeDrawing().ops,
};
