import { useEffect, useState } from 'react';

export function useChurchHistoryBackground(image: string | undefined) {
  const [backgroundImage, setBackgroundImage] = useState(image);
  const [transitionImage, setTransitionImage] = useState<string>();

  useEffect(() => {
    if (!image) {
      setBackgroundImage(undefined);
      setTransitionImage(undefined);
      return;
    }

    if (image !== backgroundImage) {
      setTransitionImage(image);
    }
  }, [image, backgroundImage]);

  function finishTransition() {
    if (transitionImage) {
      setBackgroundImage(transitionImage);
      setTransitionImage(undefined);
    }
  }

  return { backgroundImage, transitionImage, finishTransition };
}
