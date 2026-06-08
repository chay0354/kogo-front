export interface PartnerBranch {
  id: string;
  name: string;
}

export interface PartnerListItem {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_active: boolean;
  branches: PartnerBranch[];
}

export interface PartnersListResponse {
  partners: PartnerListItem[];
  summary: {
    total_partners: number;
  };
}

export interface PartnerFormData {
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  branch_ids: string[];
  password?: string;
}

export interface PartnerFilters {
  search: string;
  branch: string;
}
