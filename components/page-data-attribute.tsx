"use client";

import { useEffect } from "react";

type PageDataAttributeProps = {
  page: string;
};

export function PageDataAttribute({ page }: PageDataAttributeProps) {
  useEffect(() => {
    document.body.dataset.page = page;
    return () => {
      if (document.body.dataset.page === page) {
        delete document.body.dataset.page;
      }
    };
  }, [page]);

  return null;
}
