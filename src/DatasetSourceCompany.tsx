export function DatasetSourceCompany({ companyId, companyName }: {
  companyId: number | string;
  companyName: string | null;
}) {
  return <small className="dataset-source-company" data-i18n-skip>
    {companyName ? `${companyName} · Company ${companyId}` : `Company ${companyId}`}
  </small>;
}
